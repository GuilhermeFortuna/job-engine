from __future__ import annotations

import asyncio
import hashlib
import json
import secrets
from collections.abc import AsyncGenerator, Sequence
from dataclasses import dataclass
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
from job_engine.application_targets.provider_contract import match_provider_url
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    ApplicationBatchCreateInput,
    ApplicationBatchItemCreateInput,
    ApplicationRepository,
    ApplicationRunFilterCriteria,
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
from job_engine.domain.application_batches import (
    BATCH_CONFIRMATION_REVISION,
    BATCH_CONFIRMATION_TEXT,
    BATCH_POLICY_REVISION,
    DEFAULT_MAX_BATCH_SIZE,
    ApplicationBatch,
    BatchPreviewIssue,
    BatchPreviewIssueCode,
    BatchPreviewIssueSeverity,
    validate_batch_confirmation,
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
from job_engine.domain.enums import ApplicationTargetStatus, JobStatus
from job_engine.services.managed_assets import ManagedAssetService


class ApplicationTargetRejectedError(ValueError):
    def __init__(self, *, target_id: UUID, reason_code: str, message: str) -> None:
        super().__init__(message)
        self.target_id = target_id
        self.reason_code = reason_code
        self.message = message


class ApplicationBatchValidationError(ValueError):
    def __init__(
        self,
        message: str,
        *,
        issues: tuple[BatchPreviewIssue, ...] = (),
        conflicts: tuple[ApplicationRunConflictItem, ...] = (),
    ) -> None:
        super().__init__(message)
        self.issues = issues
        self.conflicts = conflicts


@dataclass(frozen=True)
class ResolvedBatchTarget:
    application_target_id: UUID
    job_group_id: UUID
    source_posting_id: UUID
    canonical_application_url: str
    application_url: str
    platform_adapter_id: str


@dataclass(frozen=True)
class ApplicationBatchPreviewResult:
    confirmation_text: str
    confirmation_revision: str
    policy_revision: str
    max_batch_size: int
    applicant_profile_id: UUID
    applicant_profile_version: int
    resume_asset_id: UUID
    resume_asset_version: int
    resume_sha256: str
    answer_bank_hash: str
    answer_bank_snapshot: dict[str, int]
    issues: tuple[BatchPreviewIssue, ...]
    resolved_targets: tuple[ResolvedBatchTarget, ...]


@dataclass(frozen=True)
class ApplicationBatchDuplicateOverride:
    application_target_id: UUID
    reason: str


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


def _reject_target(target_id: UUID, reason_code: str, message: str) -> None:
    raise ApplicationTargetRejectedError(
        target_id=target_id, reason_code=reason_code, message=message
    )


def _issue(
    code: BatchPreviewIssueCode,
    message: str,
    *,
    severity: BatchPreviewIssueSeverity = BatchPreviewIssueSeverity.ERROR,
    application_target_id: UUID | None = None,
    existing_run_id: UUID | None = None,
) -> BatchPreviewIssue:
    return BatchPreviewIssue(
        code=code,
        severity=severity,
        message=message,
        application_target_id=application_target_id,
        existing_run_id=existing_run_id,
    )


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

    def _max_batch_size(self) -> int:
        return min(self._settings.max_queue_limit, DEFAULT_MAX_BATCH_SIZE)

    async def _resolve_resume_disk_path(
        self,
        vault_repo: ApplicantVaultRepository,
        profile_id: UUID,
        resume: Any,
    ) -> Any:
        if resume.managed_asset_id is not None:
            managed_asset = await vault_repo.get_managed_asset(
                profile_id, resume.managed_asset_id
            )
            if managed_asset is None:
                raise ValueError("Managed asset for resume not found")
            managed_asset_service = ManagedAssetService(
                self._settings.resolved_data_root
            )
            resume_disk_path, _ = managed_asset_service.get_asset_file(
                managed_asset.relative_path
            )
            return resume_disk_path
        if resume.upload_pdf_path:
            return self._settings.resolved_resume_root / resume.upload_pdf_path
        raise ValueError("Resume file path is missing")

    async def _validate_target(
        self,
        catalog_repo: CatalogRepository,
        target_id: UUID,
    ) -> ResolvedBatchTarget:
        target_row = await catalog_repo.get_application_target_row(target_id)
        if target_row is None:
            _reject_target(
                target_id,
                "TARGET_NOT_FOUND",
                f"Application target {target_id} was not found",
            )
        assert target_row is not None
        posting = target_row.source_posting
        if posting is None:
            _reject_target(
                target_id,
                "TARGET_POSTING_MISSING",
                f"Application target {target_id} has no source posting",
            )
        assert posting is not None

        if target_row.status is not ApplicationTargetStatus.EXECUTABLE:
            _reject_target(
                target_id,
                "TARGET_NOT_EXECUTABLE",
                (
                    f"Application target {target_id} is "
                    f"{target_row.status.value}, not executable"
                ),
            )

        if posting.status in {JobStatus.CLOSED, JobStatus.STALE}:
            _reject_target(
                target_id,
                "TARGET_POSTING_INACTIVE",
                (f"Source posting for target {target_id} is {posting.status.value}"),
            )

        group_link = posting.group_links[0] if posting.group_links else None
        if group_link is None:
            _reject_target(
                target_id,
                "TARGET_GROUP_MISSING",
                f"Application target {target_id} is not linked to a job group",
            )
        assert group_link is not None
        job_group_id = group_link.job_group_id
        job_group = await catalog_repo.get_job_group(job_group_id)
        if job_group is None:
            _reject_target(
                target_id,
                "TARGET_GROUP_MISSING",
                f"Job group for target {target_id} was not found",
            )
        assert job_group is not None
        if job_group.status != JobStatus.ACTIVE:
            _reject_target(
                target_id,
                "TARGET_GROUP_INACTIVE",
                (
                    f"Job group {job_group_id} is not active "
                    f"(status: {job_group.status.value})"
                ),
            )

        expected_provider = target_row.provider
        if expected_provider not in {"greenhouse", "lever"}:
            _reject_target(
                target_id,
                "TARGET_UNSUPPORTED_PROVIDER",
                f"Application target {target_id} has unsupported provider",
            )
        match = match_provider_url(
            target_row.target_url_canonical,
            expected_provider=expected_provider,  # type: ignore[arg-type]
        )
        if not match.matched:
            _reject_target(
                target_id,
                match.reason_code or "TARGET_CONTRACT_MISMATCH",
                (
                    f"Application target {target_id} failed provider "
                    "host/path contract verification"
                ),
            )
        if match.desktop_adapter_id != target_row.desktop_adapter_id:
            _reject_target(
                target_id,
                "TARGET_ADAPTER_MISMATCH",
                (
                    f"Application target {target_id} adapter "
                    "does not match the provider contract"
                ),
            )
        if not match.production_supported or match.desktop_adapter_id is None:
            _reject_target(
                target_id,
                "TARGET_ADAPTER_UNSUPPORTED",
                f"Application target {target_id} adapter is unsupported",
            )
        assert match.desktop_adapter_id is not None

        return ResolvedBatchTarget(
            application_target_id=target_id,
            job_group_id=job_group_id,
            source_posting_id=posting.id,
            canonical_application_url=target_row.target_url_canonical,
            application_url=target_row.target_url,
            platform_adapter_id=match.desktop_adapter_id,
        )

    async def preview_batch(
        self,
        profile_id: UUID,
        *,
        application_target_ids: Sequence[UUID],
        resume_id: str,
        applicant_profile_version: int | None = None,
        resume_version: int | None = None,
        automation_mode: AutomationMode | None = None,
        duplicate_overrides: Sequence[ApplicationBatchDuplicateOverride] = (),
    ) -> ApplicationBatchPreviewResult:
        del automation_mode  # preview is mode-agnostic for capability checks
        async with self._session_factory() as session:
            vault_repo = ApplicantVaultRepository(session)
            catalog_repo = CatalogRepository(session)
            app_repo = ApplicationRepository(session)

            issues: list[BatchPreviewIssue] = []
            resolved: list[ResolvedBatchTarget] = []

            profile = await vault_repo.get_profile(profile_id)
            if profile is None:
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.PROFILE_NOT_FOUND,
                        "Applicant profile does not exist",
                    )
                )
                return ApplicationBatchPreviewResult(
                    confirmation_text=BATCH_CONFIRMATION_TEXT,
                    confirmation_revision=BATCH_CONFIRMATION_REVISION,
                    policy_revision=BATCH_POLICY_REVISION,
                    max_batch_size=self._max_batch_size(),
                    applicant_profile_id=profile_id,
                    applicant_profile_version=0,
                    resume_asset_id=uuid4(),
                    resume_asset_version=0,
                    resume_sha256="",
                    answer_bank_hash="",
                    answer_bank_snapshot={},
                    issues=tuple(issues),
                    resolved_targets=(),
                )

            if (
                applicant_profile_version is not None
                and profile.version != applicant_profile_version
            ):
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.PROFILE_VERSION_MISMATCH,
                        (
                            f"Profile version mismatch: expected "
                            f"{applicant_profile_version}, current {profile.version}"
                        ),
                    )
                )

            resume = await vault_repo.get_resume(profile.id, resume_id)
            if resume is None:
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.RESUME_NOT_FOUND,
                        f"Resume asset {resume_id} not found",
                    )
                )
                answers = await vault_repo.list_answers(profile.id)
                snapshot = {a.answer_id: a.version for a in answers}
                return ApplicationBatchPreviewResult(
                    confirmation_text=BATCH_CONFIRMATION_TEXT,
                    confirmation_revision=BATCH_CONFIRMATION_REVISION,
                    policy_revision=BATCH_POLICY_REVISION,
                    max_batch_size=self._max_batch_size(),
                    applicant_profile_id=profile.id,
                    applicant_profile_version=profile.version,
                    resume_asset_id=uuid4(),
                    resume_asset_version=0,
                    resume_sha256="",
                    answer_bank_hash=calculate_answer_bank_hash(snapshot),
                    answer_bank_snapshot=snapshot,
                    issues=tuple(issues),
                    resolved_targets=(),
                )

            if resume_version is not None and resume.version != resume_version:
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.RESUME_VERSION_MISMATCH,
                        (
                            f"Resume version mismatch: expected "
                            f"{resume_version}, current {resume.version}"
                        ),
                    )
                )

            try:
                resume_disk_path = await self._resolve_resume_disk_path(
                    vault_repo, profile.id, resume
                )
            except ValueError as exc:
                issues.append(
                    _issue(BatchPreviewIssueCode.RESUME_FILE_MISSING, str(exc))
                )
                resume_disk_path = None

            disk_sha256 = resume.sha256
            if resume_disk_path is not None:
                if not resume_disk_path.is_file():
                    issues.append(
                        _issue(
                            BatchPreviewIssueCode.RESUME_FILE_MISSING,
                            f"Resume PDF file not found at {resume_disk_path}",
                        )
                    )
                else:
                    disk_sha256 = hashlib.sha256(
                        resume_disk_path.read_bytes()
                    ).hexdigest()
                    if disk_sha256 != resume.sha256:
                        issues.append(
                            _issue(
                                BatchPreviewIssueCode.RESUME_HASH_MISMATCH,
                                "Resume file on disk does not match catalog checksum",
                            )
                        )

            answers = await vault_repo.list_answers(profile.id)
            snapshot = {a.answer_id: a.version for a in answers}
            answer_bank_hash = calculate_answer_bank_hash(snapshot)

            if not application_target_ids:
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.BATCH_EMPTY,
                        "Batch selection is empty",
                    )
                )
            elif len(application_target_ids) > self._max_batch_size():
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.BATCH_TOO_LARGE,
                        (
                            f"Batch size {len(application_target_ids)} exceeds "
                            f"limit {self._max_batch_size()}"
                        ),
                    )
                )

            seen_targets: set[UUID] = set()
            override_by_target = {
                item.application_target_id: item for item in duplicate_overrides
            }
            for target_id in application_target_ids:
                if target_id in seen_targets:
                    issues.append(
                        _issue(
                            BatchPreviewIssueCode.DUPLICATE_TARGET_IN_BATCH,
                            f"Target {target_id} appears more than once",
                            application_target_id=target_id,
                        )
                    )
                    continue
                seen_targets.add(target_id)
                try:
                    resolved_target = await self._validate_target(
                        catalog_repo, target_id
                    )
                except ApplicationTargetRejectedError as exc:
                    reason = exc.reason_code
                    if reason == "ADAPTER_UNSUPPORTED":
                        reason = BatchPreviewIssueCode.TARGET_ADAPTER_UNSUPPORTED.value
                    try:
                        code = BatchPreviewIssueCode(reason)
                    except ValueError:
                        code = BatchPreviewIssueCode.TARGET_CONTRACT_MISMATCH
                    issues.append(
                        _issue(
                            code,
                            exc.message,
                            application_target_id=target_id,
                        )
                    )
                    continue

                existing = await app_repo.find_active_or_submitted_by_url(
                    profile.id, resolved_target.canonical_application_url
                )
                if existing is not None and target_id not in override_by_target:
                    issues.append(
                        _issue(
                            BatchPreviewIssueCode.DUPLICATE_ACTIVE_RUN,
                            (
                                f"An active or submitted application run "
                                f"({existing.id}) already exists for this job"
                            ),
                            application_target_id=target_id,
                            existing_run_id=existing.id,
                        )
                    )
                    # Keep resolved metadata so authorize can emit accurate conflicts.
                    resolved.append(resolved_target)
                    continue
                resolved.append(resolved_target)

            total_pending = await app_repo.count_active_runs()
            requested = len(application_target_ids)
            if total_pending + requested > self._settings.max_queue_limit:
                issues.append(
                    _issue(
                        BatchPreviewIssueCode.QUEUE_LIMIT_EXCEEDED,
                        (
                            f"Queue limit ({self._settings.max_queue_limit}) exceeded. "
                            f"Current pending/active: {total_pending}, "
                            f"requested: {requested}"
                        ),
                    )
                )

            return ApplicationBatchPreviewResult(
                confirmation_text=BATCH_CONFIRMATION_TEXT,
                confirmation_revision=BATCH_CONFIRMATION_REVISION,
                policy_revision=BATCH_POLICY_REVISION,
                max_batch_size=self._max_batch_size(),
                applicant_profile_id=profile.id,
                applicant_profile_version=profile.version,
                resume_asset_id=resume.id,
                resume_asset_version=resume.version,
                resume_sha256=disk_sha256,
                answer_bank_hash=answer_bank_hash,
                answer_bank_snapshot=snapshot,
                issues=tuple(issues),
                resolved_targets=tuple(resolved),
            )

    async def authorize_batch(
        self,
        profile_id: UUID,
        *,
        application_target_ids: Sequence[UUID],
        resume_id: str,
        applicant_profile_version: int,
        resume_version: int,
        automation_mode: AutomationMode,
        confirmation_revision: str,
        owner_confirmation: str | None = None,
        duplicate_overrides: Sequence[ApplicationBatchDuplicateOverride] = (),
    ) -> ApplicationBatch:
        try:
            validate_batch_confirmation(
                automation_mode=automation_mode,
                confirmation_revision=confirmation_revision,
                owner_confirmation=owner_confirmation,
            )
        except ValueError as exc:
            raise ApplicationBatchValidationError(str(exc)) from exc

        preview = await self.preview_batch(
            profile_id,
            application_target_ids=application_target_ids,
            resume_id=resume_id,
            applicant_profile_version=applicant_profile_version,
            resume_version=resume_version,
            automation_mode=automation_mode,
            duplicate_overrides=duplicate_overrides,
        )
        error_issues = tuple(
            issue
            for issue in preview.issues
            if issue.severity == BatchPreviewIssueSeverity.ERROR
        )
        if error_issues:
            resolved_by_target = {
                t.application_target_id: t for t in preview.resolved_targets
            }
            enriched_conflicts: list[ApplicationRunConflictItem] = []
            async with self._session_factory() as session:
                app_repo = ApplicationRepository(session)
                for issue in error_issues:
                    if (
                        issue.code != BatchPreviewIssueCode.DUPLICATE_ACTIVE_RUN
                        or issue.existing_run_id is None
                        or issue.application_target_id is None
                    ):
                        continue
                    target = resolved_by_target.get(issue.application_target_id)
                    existing = await app_repo.get_run(issue.existing_run_id)
                    if existing is None:
                        continue
                    enriched_conflicts.append(
                        ApplicationRunConflictItem(
                            job_group_id=(
                                target.job_group_id
                                if target is not None
                                else existing.job_group_id
                            ),
                            application_target_id=issue.application_target_id,
                            canonical_application_url=(
                                target.canonical_application_url
                                if target is not None
                                else existing.canonical_application_url
                            ),
                            existing_run_id=existing.id,
                            existing_status=existing.status,
                            message=(
                                f"An active or submitted application run "
                                f"({existing.id}) already exists for this job "
                                f"({existing.status.value}). "
                                "Use the explicit duplicate-override endpoint, "
                                "then retry."
                            ),
                            reason_code=issue.code.value,
                        )
                    )
            raise ApplicationBatchValidationError(
                "Batch authorization failed validation",
                issues=error_issues,
                conflicts=tuple(enriched_conflicts),
            )

        if len(
            [
                t
                for t in preview.resolved_targets
                if t.application_target_id in set(application_target_ids)
            ]
        ) != len(set(application_target_ids)):
            raise ApplicationBatchValidationError(
                "Batch authorization failed validation",
                issues=preview.issues,
            )

        automatic_submission_authorized_at = (
            datetime.now(UTC) if automation_mode == AutomationMode.FULL_AUTO else None
        )
        override_by_target = {
            item.application_target_id: item for item in duplicate_overrides
        }
        now = datetime.now(UTC)

        async with self._session_factory() as session:
            vault_repo = ApplicantVaultRepository(session)
            catalog_repo = CatalogRepository(session)
            app_repo = ApplicationRepository(session)

            await app_repo.acquire_batch_authorization_lock(
                profile_id, list(application_target_ids)
            )

            # Re-validate under lock (CAS on versions + duplicates)
            profile = await vault_repo.get_profile(profile_id)
            if profile is None or profile.version != applicant_profile_version:
                raise ApplicationBatchValidationError(
                    "Profile version mismatch under lock"
                )
            resume = await vault_repo.get_resume(profile.id, resume_id)
            if resume is None or resume.version != resume_version:
                raise ApplicationBatchValidationError(
                    "Resume version mismatch under lock"
                )
            resume_disk_path = await self._resolve_resume_disk_path(
                vault_repo, profile.id, resume
            )
            if not resume_disk_path.is_file():
                raise ApplicationBatchValidationError("Resume file missing under lock")
            disk_sha256 = hashlib.sha256(resume_disk_path.read_bytes()).hexdigest()
            if disk_sha256 != resume.sha256:
                raise ApplicationBatchValidationError("Resume hash mismatch under lock")

            answers = await vault_repo.list_answers(profile.id)
            snapshot = {a.answer_id: a.version for a in answers}
            answer_bank_hash = calculate_answer_bank_hash(snapshot)

            total_pending = await app_repo.count_active_runs()
            if (
                total_pending + len(application_target_ids)
                > self._settings.max_queue_limit
            ):
                raise ApplicationBatchValidationError("Queue limit exceeded under lock")

            item_inputs: list[ApplicationBatchItemCreateInput] = []
            for position, target_id in enumerate(application_target_ids):
                resolved = await self._validate_target(catalog_repo, target_id)
                existing = await app_repo.find_active_or_submitted_by_url(
                    profile.id, resolved.canonical_application_url
                )
                override = override_by_target.get(target_id)
                if existing is not None and override is None:
                    raise ApplicationBatchValidationError(
                        f"Duplicate active run for target {target_id}"
                    )
                idempotency_key = calculate_idempotency_key(
                    canonical_url=resolved.canonical_application_url,
                    resume_sha256=resume.sha256,
                    profile_version=profile.version,
                    answer_bank_hash=answer_bank_hash,
                )
                item_inputs.append(
                    ApplicationBatchItemCreateInput(
                        position=position,
                        job_group_id=resolved.job_group_id,
                        application_target_id=resolved.application_target_id,
                        source_posting_id=resolved.source_posting_id,
                        canonical_application_url=resolved.canonical_application_url,
                        application_url=resolved.application_url,
                        platform_adapter_id=resolved.platform_adapter_id,
                        duplicate_override_reason=(
                            override.reason if override is not None else None
                        ),
                        duplicate_override_confirmed_at=(
                            now if override is not None else None
                        ),
                        idempotency_key=idempotency_key,
                        policy_snapshot={
                            "profile_version": profile.version,
                            "resume_id": resume.resume_id,
                            "answer_bank_hash": answer_bank_hash,
                            "application_target_id": str(target_id),
                            "batch_policy_revision": BATCH_POLICY_REVISION,
                            "confirmation_revision": BATCH_CONFIRMATION_REVISION,
                        },
                    )
                )

            batch = await app_repo.create_authorized_batch(
                ApplicationBatchCreateInput(
                    applicant_profile_id=profile.id,
                    applicant_profile_version=profile.version,
                    resume_asset_id=resume.id,
                    resume_asset_version=resume.version,
                    resume_sha256=resume.sha256,
                    answer_bank_snapshot=snapshot,
                    answer_bank_hash=answer_bank_hash,
                    automation_mode=automation_mode,
                    items=tuple(item_inputs),
                    known_capability_exceptions=(),
                    automatic_submission_authorized_at=(
                        automatic_submission_authorized_at
                    ),
                    owner_confirmed_at=now,
                    confirmation_text=BATCH_CONFIRMATION_TEXT,
                    confirmation_text_revision=BATCH_CONFIRMATION_REVISION,
                    policy_revision=BATCH_POLICY_REVISION,
                )
            )
            await session.commit()

        for item in batch.items:
            created_event = ApplicationRunEvent(
                id=uuid4(),
                run_id=item.run_id,
                attempt=1,
                sequence_num=1,
                event_type=AuditEventType.RUN_CREATED.value,
                event_payload={
                    "batch_id": str(batch.id),
                    "batch_item_id": str(item.id),
                    "applicant_profile_id": str(batch.applicant_profile_id),
                    "canonical_application_url": (
                        item.snapshot.canonical_application_url
                    ),
                    "platform_adapter_id": item.snapshot.platform_adapter_id,
                },
                created_at=datetime.now(UTC),
            )
            await self._broadcaster.publish(created_event)

        return batch

    async def create_runs(
        self,
        request: ApplicationRunCreateRequest,
        profile_id: UUID | None = None,
    ) -> tuple[tuple[ApplicationRun, ...], tuple[ApplicationRunConflictItem, ...]]:
        async with self._session_factory() as session:
            vault_repo = ApplicantVaultRepository(session)
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
            if request.resume_id:
                resume = await vault_repo.get_resume(profile.id, request.resume_id)
                if resume is None:
                    raise ValueError(f"Resume asset {request.resume_id} not found")
                resume_id = request.resume_id
            else:
                resumes = await vault_repo.list_resumes(profile.id)
                default_res = next((r for r in resumes if r.is_default), None)
                if default_res is None:
                    raise ValueError("No default resume found in catalog")
                resume = default_res
                resume_id = resume.resume_id

        try:
            batch = await self.authorize_batch(
                target_profile_id,
                application_target_ids=request.application_target_ids,
                resume_id=resume_id,
                applicant_profile_version=profile.version,
                resume_version=resume.version,
                automation_mode=request.automation_mode,
                confirmation_revision=BATCH_CONFIRMATION_REVISION,
                owner_confirmation=request.owner_confirmation,
            )
        except ApplicationBatchValidationError as exc:
            if exc.conflicts and not any(
                issue.code != BatchPreviewIssueCode.DUPLICATE_ACTIVE_RUN
                for issue in exc.issues
            ):
                return (), exc.conflicts
            if exc.issues:
                first = exc.issues[0]
                if first.application_target_id is not None:
                    raise ApplicationTargetRejectedError(
                        target_id=first.application_target_id,
                        reason_code=first.code.value,
                        message=first.message,
                    ) from exc
            raise ValueError(str(exc)) from exc

        runs: list[ApplicationRun] = []
        async with self._session_factory() as session:
            app_repo = ApplicationRepository(session)
            for item in batch.items:
                run = await app_repo.get_run(item.run_id)
                if run is not None:
                    runs.append(run)
        return tuple(runs), ()

    async def get_batch(
        self, profile_id: UUID, batch_id: UUID
    ) -> ApplicationBatch | None:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            return await repo.get_batch(profile_id, batch_id)

    async def list_batches(
        self,
        profile_id: UUID,
        *,
        page: int = 1,
        page_size: int = 25,
    ) -> tuple[tuple[ApplicationBatch, ...], int]:
        offset = max(page - 1, 0) * page_size
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            return await repo.list_batches(profile_id, offset=offset, limit=page_size)

    async def cancel_batch(
        self,
        profile_id: UUID,
        batch_id: UUID,
        reason: str | None = None,
    ) -> ApplicationBatch:
        async with self._session_factory() as session:
            repo = ApplicationRepository(session)
            updated = await repo.cancel_batch(profile_id, batch_id, reason=reason)
            await session.commit()

        for item in updated.items:
            if item.run_status != ApplicationRunStatus.CANCELLED:
                continue
            cancel_event = ApplicationRunEvent(
                id=uuid4(),
                run_id=item.run_id,
                attempt=1,
                sequence_num=200,
                event_type=AuditEventType.RUN_CANCELLED.value,
                event_payload={
                    "batch_id": str(updated.id),
                    "batch_item_id": str(item.id),
                    "reason": reason or "Cancelled via batch cancellation",
                },
                created_at=datetime.now(UTC),
            )
            await self._broadcaster.publish(cancel_event)
        return updated

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
