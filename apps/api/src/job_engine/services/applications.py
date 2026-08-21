from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
from collections.abc import AsyncGenerator
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from job_engine.api.schemas import (
    ApplicationRunConflictItem,
    ApplicationRunCreateRequest,
    ReleaseSubmitRequest,
    ResolveAnswersRequest,
)
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    ApplicationRepository,
    ApplicationRunFilterCriteria,
    ApplicationRunInput,
    ApplicationRunNotFoundError,
    CatalogRepository,
    ResourceNotFoundError,
)
from job_engine.domain.applicant import (
    LEGAL_CONSENT_INTENTS,
    PolicyCategory,
    QuestionIntent,
    ReusableAnswerInput,
)
from job_engine.domain.application_answers import (
    ControlType,
    ObservationValidationConstraints,
    QuestionObservation,
    validate_control_compatibility,
)
from job_engine.domain.applications import (
    ApplicationException,
    ApplicationRun,
    ApplicationRunEvent,
    ApplicationRunStatus,
    AuditEventType,
    AutomationMode,
    EvidenceArtifact,
    EvidenceType,
    ExceptionStatus,
    ExceptionType,
    ReceiptSummary,
    RunnerReleaseReason,
    calculate_answer_bank_hash,
    calculate_idempotency_key,
    calculate_token_hash,
    redact_audit_payload,
    sanitize_dom_snapshot,
)
from job_engine.domain.enums import JobStatus
from job_engine.services.managed_assets import ManagedAssetService


def format_sse_run_event(event: ApplicationRunEvent) -> str:
    payload_json = json.dumps(
        {
            "id": str(event.id),
            "run_id": str(event.run_id),
            "attempt": event.attempt,
            "sequence_num": event.sequence_num,
            "event_type": event.event_type,
            "event_payload": event.event_payload,
            "created_at": event.created_at.isoformat(),
        }
    )
    return (
        f"id: {event.run_id}:{event.sequence_num}\n"
        f"event: {event.event_type}\n"
        f"data: {payload_json}\n\n"
    )


class ApplicationEventBroadcaster:
    """In-memory pub/sub broadcaster for live SSE events."""

    def __init__(self) -> None:
        self._subscribers: set[asyncio.Queue[ApplicationRunEvent | None]] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue[ApplicationRunEvent | None]:
        q: asyncio.Queue[ApplicationRunEvent | None] = asyncio.Queue()
        async with self._lock:
            self._subscribers.add(q)
        return q

    async def unsubscribe(self, q: asyncio.Queue[ApplicationRunEvent | None]) -> None:
        async with self._lock:
            self._subscribers.discard(q)

    async def publish(self, event: ApplicationRunEvent) -> None:
        async with self._lock:
            for q in list(self._subscribers):
                try:
                    q.put_nowait(event)
                except Exception:
                    pass


_GLOBAL_BROADCASTER = ApplicationEventBroadcaster()


def get_global_broadcaster() -> ApplicationEventBroadcaster:
    return _GLOBAL_BROADCASTER


def _detect_platform_adapter(canonical_url: str) -> str:
    lower = canonical_url.lower()
    if "greenhouse.io" in lower:
        return "greenhouse"
    if "lever.co" in lower:
        return "lever"
    return "generic"


class ApplicationService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
        broadcaster: ApplicationEventBroadcaster | None = None,
    ) -> None:
        self._session_factory = session_factory
        self._settings = settings
        self._broadcaster = broadcaster or get_global_broadcaster()

    async def create_runs(
        self,
        request: ApplicationRunCreateRequest,
        profile_id: UUID | None = None,
    ) -> tuple[tuple[ApplicationRun, ...], tuple[ApplicationRunConflictItem, ...]]:
        automatic_submission_authorized_at = (
            datetime.now(UTC)
            if request.automation_mode == AutomationMode.FULL_AUTO
            else None
        )
        async with self._session_factory() as session:
            vault_repo = ApplicantVaultRepository(session)
            catalog_repo = CatalogRepository(session)
            app_repo = ApplicationRepository(session)

            # 1. Profile must exist
            target_profile_id = profile_id
            if target_profile_id is None:
                target_profile_id = await vault_repo.get_active_profile_id()
            if target_profile_id is None:
                raise ValueError(
                    "Applicant profile does not exist. Please configure profile first."
                )

            profile = await vault_repo.get_profile(target_profile_id)
            if profile is None:
                raise ValueError(
                    "Applicant profile does not exist. Please configure profile first."
                )

            # 2. Queue limit check
            total_pending = await app_repo.count_active_runs()
            if (
                total_pending + len(request.job_group_ids)
                > self._settings.max_queue_limit
            ):
                raise ValueError(
                    f"Queue limit ({self._settings.max_queue_limit}) exceeded. "
                    f"Current pending/active: {total_pending}, "
                    f"requested: {len(request.job_group_ids)}"
                )

            # 3. Resolve resume asset & verify on disk
            if request.resume_id:
                resume = await vault_repo.get_resume(profile.id, request.resume_id)
                if resume is None:
                    raise ValueError(f"Resume asset {request.resume_id} not found")
            else:
                resumes = await vault_repo.list_resumes(profile.id)
                default_res = next((r for r in resumes if r.is_default), None)
                if default_res is None:
                    raise ValueError("No default resume found in catalog")
                resume = default_res

            if resume.managed_asset_id is not None:
                managed_asset = await vault_repo.get_managed_asset(
                    profile.id, resume.managed_asset_id
                )
                if managed_asset is None:
                    raise ValueError("Managed asset for resume not found")
                managed_asset_service = ManagedAssetService(
                    self._settings.resolved_data_root
                )
                resume_disk_path, _ = managed_asset_service.get_asset_file(
                    managed_asset.relative_path
                )
            elif resume.upload_pdf_path:
                resume_disk_path = (
                    self._settings.resolved_resume_root / resume.upload_pdf_path
                )
            else:
                raise ValueError("Resume file path is missing")

            if not resume_disk_path.is_file():
                raise ValueError(f"Resume PDF file not found at {resume_disk_path}")
            disk_sha256 = hashlib.sha256(resume_disk_path.read_bytes()).hexdigest()
            if disk_sha256 != resume.sha256:
                raise ValueError("Resume file on disk does not match catalog checksum")

            # 4. Snapshot reusable answers
            answers = await vault_repo.list_answers(profile.id)
            snapshot = {a.answer_id: a.version for a in answers}
            answer_bank_hash = calculate_answer_bank_hash(snapshot)

            created_runs: list[ApplicationRun] = []
            conflicts: list[ApplicationRunConflictItem] = []

            for job_group_id in request.job_group_ids:
                job_group = await catalog_repo.get_job_group(job_group_id)
                if job_group is None:
                    raise ValueError(f"Job group {job_group_id} not found")
                if job_group.status != JobStatus.ACTIVE:
                    raise ValueError(
                        f"Job group {job_group_id} is not active "
                        f"(status: {job_group.status.value})"
                    )

                # Find primary posting
                if not job_group.source_postings:
                    raise ValueError(
                        f"Job group {job_group_id} has no linked source postings"
                    )
                posting = job_group.source_postings[0]
                canonical_url = (
                    posting.application_url_canonical or posting.application_url
                )
                platform_adapter_id = _detect_platform_adapter(canonical_url)

                idempotency_key = calculate_idempotency_key(
                    canonical_url=canonical_url,
                    resume_sha256=resume.sha256,
                    profile_version=profile.version,
                    answer_bank_hash=answer_bank_hash,
                )

                # Check duplicate
                existing_run = await app_repo.find_active_or_submitted_by_url(
                    profile.id, canonical_url
                )
                if existing_run is not None:
                    conflicts.append(
                        ApplicationRunConflictItem(
                            job_group_id=job_group_id,
                            canonical_application_url=canonical_url,
                            existing_run_id=existing_run.id,
                            existing_status=existing_run.status,
                            message=(
                                f"An active or submitted application run "
                                f"({existing_run.id}) already exists for this job "
                                f"({existing_run.status.value}). "
                                "Use the explicit duplicate-override endpoint, "
                                "then retry."
                            ),
                        )
                    )
                    continue

                run_input = ApplicationRunInput(
                    applicant_profile_id=profile.id,
                    job_group_id=job_group_id,
                    source_posting_id=posting.id,
                    canonical_application_url=canonical_url,
                    application_url=posting.application_url,
                    platform_adapter_id=platform_adapter_id,
                    resume_asset_id=resume.id,
                    resume_sha256=resume.sha256,
                    applicant_profile_version=profile.version,
                    answer_bank_snapshot=snapshot,
                    answer_bank_hash=answer_bank_hash,
                    automation_mode=request.automation_mode,
                    automatic_submission_authorized_at=(
                        automatic_submission_authorized_at
                    ),
                    idempotency_key=idempotency_key,
                    policy_snapshot={
                        "profile_version": profile.version,
                        "resume_id": resume.resume_id,
                        "answer_bank_hash": answer_bank_hash,
                    },
                    duplicate_override_confirmed_at=None,
                    duplicate_override_reason=None,
                )
                created = await app_repo.create_run(run_input)
                created_runs.append(created)

            await session.commit()

        # Broadcast events outside transaction
        for run in created_runs:
            created_event = ApplicationRunEvent(
                id=uuid4(),
                run_id=run.id,
                attempt=1,
                sequence_num=1,
                event_type=AuditEventType.RUN_CREATED.value,
                event_payload={
                    "canonical_application_url": run.canonical_application_url,
                    "platform_adapter_id": run.platform_adapter_id,
                },
                created_at=datetime.now(UTC),
            )
            await self._broadcaster.publish(created_event)

        return tuple(created_runs), tuple(conflicts)

    async def get_run(self, run_id: UUID) -> ApplicationRun | None:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            return await repo.get_run(run_id)

    async def list_runs(
        self, criteria: ApplicationRunFilterCriteria
    ) -> tuple[tuple[ApplicationRun, ...], int]:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            return await repo.list_runs(criteria)

    async def claim_run(
        self, runner_id: str, run_id: UUID | None = None
    ) -> tuple[ApplicationRun, str, str, datetime] | None:
        raw_lease_token = secrets.token_urlsafe(32)
        lease_token_hash = calculate_token_hash(raw_lease_token)

        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            result = await repo.claim_next_run(
                runner_id=runner_id,
                lease_token_hash=lease_token_hash,
                lease_duration_seconds=self._settings.runner_lease_duration_seconds,
                max_concurrency=self._settings.runner_concurrency_limit,
                run_id=run_id,
            )
            if result is None:
                return None

            run, grant, raw_grant_token = result
            await session.commit()

        # Broadcast claim event
        claim_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run.id,
            attempt=run.attempt_count,
            sequence_num=2,
            event_type=AuditEventType.LEASE_CLAIMED.value,
            event_payload={"runner_id": runner_id, "attempt": run.attempt_count},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(claim_event)

        return (
            run,
            raw_lease_token,
            raw_grant_token,
            run.lease_expires_at or (datetime.now(UTC) + timedelta(seconds=60)),
        )

    async def heartbeat(
        self, run_id: UUID, lease_token: str, extend_seconds: int = 60
    ) -> ApplicationRun:
        lease_token_hash = calculate_token_hash(lease_token)
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.heartbeat_lease(
                run_id, lease_token_hash, extend_seconds
            )
            await session.commit()
        return updated

    async def post_event(
        self,
        run_id: UUID,
        lease_token: str,
        attempt: int,
        sequence_num: int,
        event_type: str,
        event_payload: dict[str, Any],
        idempotency_key: str | None = None,
    ) -> ApplicationRunEvent:
        lease_token_hash = calculate_token_hash(lease_token)
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            event = await repo.append_event(
                run_id=run_id,
                lease_token_hash=lease_token_hash,
                attempt=attempt,
                sequence_num=sequence_num,
                event_type=event_type,
                payload=event_payload,
                idempotency_key=idempotency_key,
            )
            await session.commit()

        await self._broadcaster.publish(event)
        return event

    async def record_checkpoint(
        self,
        run_id: UUID,
        lease_token: str,
        checkpoint: str,
        step_description: str | None = None,
    ) -> ApplicationRun:
        lease_token_hash = calculate_token_hash(lease_token)
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.record_checkpoint(
                run_id, lease_token_hash, checkpoint, step_description
            )
            await session.commit()

        chk_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count,
            sequence_num=100,
            event_type=AuditEventType.CHECKPOINT_REACHED.value,
            event_payload={"checkpoint": checkpoint, "step": step_description},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(chk_event)
        return updated

    async def raise_exception(
        self,
        run_id: UUID,
        lease_token: str,
        exception_type: ExceptionType,
        context_payload: dict[str, Any],
    ) -> ApplicationException:
        lease_token_hash = calculate_token_hash(lease_token)
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            exc = await repo.raise_exception(
                run_id, lease_token_hash, exception_type, context_payload
            )
            await session.commit()

        exc_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=1,
            sequence_num=101,
            event_type=AuditEventType.EXCEPTION_RAISED.value,
            event_payload={"exception_type": exception_type.value},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(exc_event)
        return exc

    async def resolve_answers(
        self, run_id: UUID, request: ResolveAnswersRequest
    ) -> ApplicationRun:
        async with self._session_factory() as session:
            vault_repo = ApplicantVaultRepository(session)
            app_repo = ApplicationRepository(session)

            run = await app_repo.get_run(run_id)
            if run is None:
                raise ApplicationRunNotFoundError(f"Run {run_id} not found")
            exception = next(
                (item for item in run.exceptions if item.id == request.exception_id),
                None,
            )
            if exception is None:
                raise ResourceNotFoundError(
                    f"Exception {request.exception_id} not found for run {run_id}"
                )
            if exception.status != ExceptionStatus.PENDING:
                raise ValueError(f"Exception {request.exception_id} is not pending")
            if exception.exception_type not in {
                ExceptionType.MISSING_PROFILE_FIELD,
                ExceptionType.UNRESOLVED_QUESTION,
                ExceptionType.REVIEW_REQUIRED,
            }:
                raise ValueError(
                    f"Exception type '{exception.exception_type.value}' does not "
                    "accept owner field answers"
                )

            raw_fields = exception.context_payload.get("fields")
            if not isinstance(raw_fields, list) or not raw_fields:
                raise ValueError("Exception has no resolvable field reports")
            fields_by_fingerprint: dict[str, dict[str, Any]] = {}
            for raw in raw_fields:
                if not isinstance(raw, dict):
                    continue
                fingerprint = raw.get("field_fingerprint")
                if not isinstance(fingerprint, str) or not fingerprint.strip():
                    continue
                if fingerprint in fields_by_fingerprint:
                    raise ValueError(
                        f"Exception contains duplicate field_fingerprint: {fingerprint}"
                    )
                fields_by_fingerprint[fingerprint] = raw

            requested_fingerprints = [
                item.field_fingerprint for item in request.answers
            ]
            if len(set(requested_fingerprints)) != len(requested_fingerprints):
                raise ValueError("Each field_fingerprint may be resolved only once")
            if set(requested_fingerprints) != set(fields_by_fingerprint):
                raise ValueError(
                    "Resolution must provide exactly one answer for every "
                    "exception field"
                )

            owner_answers: list[dict[str, Any]] = []

            for ans_item in request.answers:
                field = fields_by_fingerprint[ans_item.field_fingerprint]
                try:
                    control_type = ControlType(str(field["control_type"]))
                    intent_raw = field.get("question_intent")
                    intent = (
                        QuestionIntent(intent_raw)
                        if isinstance(intent_raw, str)
                        else None
                    )
                    constraints = ObservationValidationConstraints(
                        min_length=(
                            field.get("min_length")
                            if isinstance(field.get("min_length"), int)
                            else None
                        ),
                        max_length=(
                            field.get("max_length")
                            if isinstance(field.get("max_length"), int)
                            else None
                        ),
                        pattern=(
                            field.get("pattern")
                            if isinstance(field.get("pattern"), str)
                            else None
                        ),
                    )
                    observation = QuestionObservation(
                        run_id=run.id,
                        adapter_id=run.platform_adapter_id,
                        page_id=str(
                            exception.context_payload.get("page_id", "owner_review")
                        ),
                        field_fingerprint=ans_item.field_fingerprint,
                        label=str(field["label"]),
                        required=bool(field["required"]),
                        control_type=control_type,
                        options=tuple(
                            option
                            for option in field.get("options", ())
                            if isinstance(option, str)
                        ),
                        validation_constraints=constraints,
                    )
                except (KeyError, TypeError, ValueError) as exc:
                    raise ValueError(
                        f"Invalid field report for {ans_item.field_fingerprint}"
                    ) from exc

                mismatch = validate_control_compatibility(
                    observation, ans_item.answer_text
                )
                if mismatch is not None:
                    raise ValueError(
                        f"Answer for {ans_item.field_fingerprint} is incompatible: "
                        f"{mismatch.value}"
                    )

                saved_to_answer_bank = False
                if ans_item.save_to_answer_bank:
                    if intent is None or intent in LEGAL_CONSENT_INTENTS:
                        raise ValueError(
                            f"Field {ans_item.field_fingerprint} cannot be saved "
                            "to the reusable answer bank"
                        )
                    if ans_item.platform_scope not in {
                        None,
                        run.platform_adapter_id,
                    }:
                        raise ValueError(
                            "platform_scope must be omitted or match the run adapter"
                        )
                    answer_id = f"ans_{uuid4().hex[:12]}"
                    await vault_repo.create_answer(
                        run.applicant_profile_id,
                        ReusableAnswerInput(
                            applicant_profile_id=run.applicant_profile_id,
                            answer_id=answer_id,
                            question_intent=intent,
                            jurisdiction=ans_item.jurisdiction,
                            platform_scope=ans_item.platform_scope,
                            answer_text=ans_item.answer_text,
                            policy_category=PolicyCategory.APPROVED_REUSABLE,
                            provenance="owner_authored",
                            last_confirmed_at=datetime.now(UTC),
                        ),
                    )
                    saved_to_answer_bank = True

                owner_answers.append(
                    {
                        "field_fingerprint": ans_item.field_fingerprint,
                        "label": observation.label,
                        "control_type": observation.control_type.value,
                        "question_intent": intent.value if intent is not None else None,
                        "answer_text": ans_item.answer_text,
                        "saved_to_answer_bank": saved_to_answer_bank,
                    }
                )

            updated = await app_repo.resolve_exception(
                run_id=run_id,
                exception_id=request.exception_id,
                resolution_payload={"owner_answers": owner_answers},
            )
            await session.commit()

        res_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count or 1,
            sequence_num=102,
            event_type=AuditEventType.EXCEPTION_RESOLVED.value,
            event_payload={"exception_id": str(request.exception_id)},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(res_event)
        return updated

    async def release_submit(
        self, run_id: UUID, request: ReleaseSubmitRequest
    ) -> ApplicationRun:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.release_submit(run_id, request.owner_confirmation)
            await session.commit()

        rel_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count or 1,
            sequence_num=103,
            event_type=AuditEventType.SUBMIT_RELEASED.value,
            event_payload={"owner_confirmation": request.owner_confirmation},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(rel_event)
        return updated

    async def release_claim(
        self,
        run_id: UUID,
        lease_token: str,
        runner_id: str,
        reason: RunnerReleaseReason,
        request_id: str,
    ) -> ApplicationRun:
        lease_token_hash = calculate_token_hash(lease_token)
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.release_claim(
                run_id=run_id,
                lease_token_hash=lease_token_hash,
                runner_id=runner_id,
                reason=reason.value,
                request_id=request_id,
            )
            await session.commit()

        rel_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count or 1,
            sequence_num=107,
            event_type=AuditEventType.LEASE_RELEASED.value,
            event_payload={"reason": reason.value, "runner_id": runner_id},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(rel_event)
        return updated

    async def resume_run(self, run_id: UUID) -> ApplicationRun:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.resume_run(run_id)
            await session.commit()

        res_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count or 1,
            sequence_num=104,
            event_type=AuditEventType.STATUS_CHANGED.value,
            event_payload={"new_status": "queued", "reason": "User resumed run"},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(res_event)
        return updated

    async def cancel_run(
        self, run_id: UUID, reason: str | None = None
    ) -> ApplicationRun:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.cancel_run(run_id, reason)
            await session.commit()

        can_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count or 1,
            sequence_num=105,
            event_type=AuditEventType.RUN_CANCELLED.value,
            event_payload={"reason": reason or "Cancelled by user"},
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(can_event)
        return updated

    async def override_duplicate(
        self, run_id: UUID, owner_confirmation: str, reason: str
    ) -> ApplicationRun:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.override_duplicate(run_id, owner_confirmation, reason)
            await session.commit()
        return updated

    async def complete_run(
        self,
        run_id: UUID,
        lease_token: str,
        terminal_status: ApplicationRunStatus,
        terminal_reason: str | None = None,
        receipt: ReceiptSummary | None = None,
    ) -> ApplicationRun:
        lease_token_hash = calculate_token_hash(lease_token)
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.complete_run(
                run_id=run_id,
                lease_token_hash=lease_token_hash,
                terminal_status=terminal_status,
                terminal_reason=terminal_reason,
                receipt_summary=receipt,
            )
            await session.commit()

        comp_event = ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=updated.attempt_count or 1,
            sequence_num=106,
            event_type=AuditEventType.RUN_COMPLETED.value,
            event_payload={
                "terminal_status": terminal_status.value,
                "terminal_reason": terminal_reason,
            },
            created_at=datetime.now(UTC),
        )
        await self._broadcaster.publish(comp_event)
        return updated

    async def store_evidence(
        self,
        run_id: UUID,
        lease_token: str,
        attempt: int,
        evidence_type: EvidenceType,
        file_bytes: bytes,
        filename: str,
        metadata_payload: dict[str, Any] | None = None,
    ) -> EvidenceArtifact:
        lease_token_hash = calculate_token_hash(lease_token)

        # Path confinement check
        clean_filename = Path(filename).name
        if (
            not clean_filename
            or clean_filename in {".", ".."}
            or "/" in filename
            or "\\" in filename
        ):
            raise ValueError(f"Invalid evidence filename: {filename}")

        # Sanitize DOM if needed
        if evidence_type == EvidenceType.DOM_SNAPSHOT:
            try:
                decoded = file_bytes.decode("utf-8")
                sanitized = sanitize_dom_snapshot(decoded)
                file_bytes = sanitized.encode("utf-8")
            except (UnicodeDecodeError, ValueError) as exc:
                raise ValueError("DOM evidence could not be safely sanitized") from exc
        if evidence_type == EvidenceType.SCREENSHOT and not (
            metadata_payload and metadata_payload.get("redaction_applied") is True
        ):
            raise ValueError(
                "Screenshot evidence requires redaction_applied=true metadata"
            )

        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            run = await repo.authorize_active_lease(run_id, lease_token_hash)
            if attempt != run.attempt_count:
                raise ValueError(
                    f"Evidence attempt {attempt} does not match active attempt "
                    f"{run.attempt_count}"
                )

            evidence_dir = (
                self._settings.resolved_evidence_root
                / f"runs/{run_id}/attempt_{attempt}"
            )
            evidence_dir.mkdir(parents=True, exist_ok=True)
            evidence_file = evidence_dir / clean_filename
            if evidence_file.exists():
                raise ValueError("Evidence filename already exists for this attempt")

            evidence_file.write_bytes(file_bytes)
            evidence_file.chmod(0o600)

            relative_path = f"runs/{run_id}/attempt_{attempt}/{clean_filename}"
            sha256 = hashlib.sha256(file_bytes).hexdigest()

            try:
                ev = await repo.add_evidence_artifact(
                    run_id=run_id,
                    attempt=attempt,
                    evidence_type=evidence_type,
                    relative_path=relative_path,
                    sha256=sha256,
                    file_size_bytes=len(file_bytes),
                    metadata_payload=(
                        redact_audit_payload(metadata_payload)
                        if metadata_payload is not None
                        else None
                    ),
                )
                await session.commit()
                return ev
            except Exception:
                evidence_file.unlink(missing_ok=True)
                raise

    async def get_resume_asset_for_grant(
        self, run_id: UUID, grant_token: str
    ) -> tuple[Path, str, str]:
        grant_token_hash = calculate_token_hash(grant_token)
        async with self._session_factory() as session:
            app_repo = ApplicationRepository(session)
            vault_repo = ApplicantVaultRepository(session)

            grant = await app_repo.consume_resume_grant(run_id, grant_token_hash)
            run = await app_repo.get_run(run_id)
            if run is None:
                raise ApplicationRunNotFoundError(f"Run {run_id} not found")

            resume = await vault_repo.get_resume_by_id(
                run.applicant_profile_id, grant.resume_asset_id
            )
            if resume is None:
                raise ResourceNotFoundError(
                    f"Resume asset {grant.resume_asset_id} not found"
                )

            if resume.managed_asset_id is not None:
                managed_asset = await vault_repo.get_managed_asset(
                    run.applicant_profile_id, resume.managed_asset_id
                )
                if managed_asset is None:
                    raise ResourceNotFoundError("Managed asset for resume not found")
                managed_asset_service = ManagedAssetService(
                    self._settings.resolved_data_root
                )
                resume_path, _ = managed_asset_service.get_asset_file(
                    managed_asset.relative_path
                )
                file_name = managed_asset.file_name
            elif resume.upload_pdf_path:
                resume_path = (
                    self._settings.resolved_resume_root / resume.upload_pdf_path
                ).resolve()
                if not resume_path.is_file() or not str(resume_path).startswith(
                    str(self._settings.resolved_resume_root)
                ):
                    raise ValueError(
                        "Resume file not confined within resolved resume root"
                    )
                file_name = resume_path.name
            else:
                raise ValueError("Resume file path is missing")

            disk_sha256 = hashlib.sha256(resume_path.read_bytes()).hexdigest()
            if disk_sha256 != grant.sha256:
                raise ValueError(
                    "Resume checksum on disk does not match grant requirement"
                )

            await session.commit()
            return resume_path, grant.sha256, file_name

    async def cleanup_expired_evidence(self, retention_days: int = 30) -> int:
        cutoff = datetime.now(UTC) - timedelta(days=retention_days)
        cleaned = 0
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            runs, _ = await repo.list_runs(
                ApplicationRunFilterCriteria(
                    statuses=(
                        ApplicationRunStatus.SUBMITTED,
                        ApplicationRunStatus.SUBMISSION_UNKNOWN,
                        ApplicationRunStatus.FAILED_FINAL,
                        ApplicationRunStatus.CANCELLED,
                    ),
                    created_before=cutoff,
                    limit=500,
                )
            )

        for run in runs:
            run_ev_dir = self._settings.resolved_evidence_root / f"runs/{run.id}"
            if run_ev_dir.is_dir():
                import shutil

                shutil.rmtree(run_ev_dir, ignore_errors=True)
                cleaned += 1

        return cleaned

    async def stream_events(
        self,
        last_event_id: str | None = None,
        run_id: UUID | None = None,
    ) -> AsyncGenerator[str]:
        # 1. Subscribe to live queue first so no live events are missed during DB query
        sub_queue = await self._broadcaster.subscribe()
        emitted_ids: set[str] = set()

        try:
            # 2. Replay historical events if last_event_id provided
            since_seq: int | None = None
            if last_event_id:
                try:
                    if ":" in last_event_id:
                        _, seq_str = last_event_id.split(":", 1)
                        since_seq = int(seq_str)
                except Exception:
                    pass

            async with self._session_factory() as session:
                repo = ApplicationRepository(session)
                db_events = await repo.list_events(
                    run_id=run_id, since_sequence=since_seq
                )

            for ev in db_events:
                ev_key = f"{ev.run_id}:{ev.sequence_num}"
                emitted_ids.add(ev_key)
                yield format_sse_run_event(ev)

            # 3. Stream live events
            while True:
                live_event = await sub_queue.get()
                if live_event is None:
                    break
                if run_id is not None and live_event.run_id != run_id:
                    continue
                ev_key = f"{live_event.run_id}:{live_event.sequence_num}"
                if ev_key not in emitted_ids:
                    emitted_ids.add(ev_key)
                    yield format_sse_run_event(live_event)
        finally:
            await self._broadcaster.unsubscribe(sub_queue)
