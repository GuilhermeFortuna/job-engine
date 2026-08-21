from __future__ import annotations

import hmac
import json
from collections.abc import Sequence
from datetime import datetime
from math import ceil
from typing import Annotated, Any
from uuid import UUID

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse

from job_engine.api.dependencies import get_settings
from job_engine.api.schemas import (
    ApplicationBatchCountersRead,
    ApplicationBatchCreateRequest,
    ApplicationBatchItemRead,
    ApplicationBatchListResponse,
    ApplicationBatchPreviewIssueRead,
    ApplicationBatchPreviewRequest,
    ApplicationBatchPreviewResponse,
    ApplicationBatchRead,
    ApplicationBatchResolvedTargetRead,
    ApplicationExceptionFieldRead,
    ApplicationExceptionRead,
    ApplicationRunCreateRequest,
    ApplicationRunCreateResponse,
    ApplicationRunDetailRead,
    ApplicationRunEventRead,
    ApplicationRunListResponse,
    ApplicationRunRead,
    ApplicationRunReceiptRead,
    CancelBatchRequest,
    CancelRunRequest,
    DuplicateOverrideInput,
    EvidenceArtifactRead,
    EvidenceUploadResponse,
    ReleaseSubmitRequest,
    ResolveAnswersRequest,
    RunnerCheckpointRequest,
    RunnerClaimRequest,
    RunnerClaimResponse,
    RunnerCompleteRequest,
    RunnerEventRequest,
    RunnerExceptionRequest,
    RunnerHeartbeatRequest,
    RunnerReleaseClaimRequest,
)
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicationRunFilterCriteria,
    ApplicationRunNotFoundError,
    ClaimNotReleasableError,
    GrantAlreadyConsumedError,
    GrantExpiredError,
    LeaseExpiredOrInvalidError,
    ResourceNotFoundError,
    SubmissionDeniedError,
    SubmitArmedRequirementError,
)
from job_engine.domain.applicant import LEGAL_CONSENT_INTENTS, QuestionIntent
from job_engine.domain.application_answers import ControlType
from job_engine.domain.application_batches import ApplicationBatch
from job_engine.domain.applications import (
    ApplicationException,
    ApplicationRun,
    ApplicationRunEvent,
    ApplicationRunStatus,
    AutomationMode,
    EvidenceArtifact,
    EvidenceType,
    ReceiptSummary,
    RunCheckpoint,
)
from job_engine.services.applications import (
    ApplicationBatchDuplicateOverride,
    ApplicationBatchValidationError,
    ApplicationService,
    ApplicationTargetRejectedError,
)

application_runs_router = APIRouter(
    prefix="/application-runs", tags=["application-runs"]
)
application_batches_router = APIRouter(tags=["application-batches"])
runner_router = APIRouter(prefix="/runner", tags=["runner"])


def get_application_service(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApplicationService:
    factory = request.app.state.session_factory
    return ApplicationService(session_factory=factory, settings=settings)


def verify_runner_secret(
    settings: Annotated[Settings, Depends(get_settings)],
    authorization: Annotated[str | None, Header(alias="Authorization")] = None,
) -> None:
    scheme, _, credential = (authorization or "").partition(" ")
    if (
        scheme.casefold() != "bearer"
        or not credential
        or not hmac.compare_digest(credential, settings.runner_secret)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing runner bearer credential",
        )


def get_runner_lease_token(
    x_runner_lease_token: Annotated[
        str | None, Header(alias="X-Runner-Lease-Token")
    ] = None,
) -> str:
    if not x_runner_lease_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Runner-Lease-Token header",
        )
    return x_runner_lease_token


def get_resume_grant_token(
    x_resume_grant_token: Annotated[
        str | None, Header(alias="X-Resume-Grant-Token")
    ] = None,
) -> str:
    if not x_resume_grant_token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing X-Resume-Grant-Token header",
        )
    return x_resume_grant_token


def _map_receipt_read(
    receipt: ReceiptSummary | None,
) -> ApplicationRunReceiptRead | None:
    if receipt is None:
        return None
    return ApplicationRunReceiptRead(
        platform_adapter_id=receipt.platform_adapter_id,
        final_url=receipt.final_url,
        platform_receipt_id=receipt.platform_receipt_id,
        confirmation_signal=receipt.confirmation_signal,
        capture_timestamp=receipt.capture_timestamp,
        artifact_hash=receipt.artifact_hash,
        summary_notes=receipt.summary_notes,
    )


def _map_event_read(event: ApplicationRunEvent) -> ApplicationRunEventRead:
    return ApplicationRunEventRead(
        id=event.id,
        run_id=event.run_id,
        attempt=event.attempt,
        sequence_num=event.sequence_num,
        event_type=event.event_type,
        event_payload=event.event_payload,
        idempotency_key=event.idempotency_key,
        created_at=event.created_at,
    )


def _extract_exception_field_reports(
    context_payload: dict[str, Any],
) -> tuple[ApplicationExceptionFieldRead, ...]:
    raw_fields = context_payload.get("fields")
    if not isinstance(raw_fields, list):
        return ()

    reports: list[ApplicationExceptionFieldRead] = []
    for raw in raw_fields:
        if not isinstance(raw, dict):
            continue
        try:
            intent_raw = raw.get("question_intent")
            intent = QuestionIntent(intent_raw) if isinstance(intent_raw, str) else None
            reports.append(
                ApplicationExceptionFieldRead(
                    field_fingerprint=str(raw["field_fingerprint"]),
                    label=str(raw["label"]),
                    control_type=ControlType(str(raw["control_type"])),
                    required=bool(raw["required"]),
                    status=str(raw["status"]),
                    reason_code=(
                        str(raw["reason_code"])
                        if raw.get("reason_code") is not None
                        else None
                    ),
                    question_intent=intent,
                    options=tuple(
                        str(option)
                        for option in raw.get("options", ())
                        if isinstance(option, str)
                    ),
                    min_length=(
                        int(raw["min_length"])
                        if isinstance(raw.get("min_length"), int)
                        else None
                    ),
                    max_length=(
                        int(raw["max_length"])
                        if isinstance(raw.get("max_length"), int)
                        else None
                    ),
                    pattern=(
                        str(raw["pattern"])
                        if isinstance(raw.get("pattern"), str)
                        else None
                    ),
                    allow_save_to_answer_bank=(
                        intent is not None and intent not in LEGAL_CONSENT_INTENTS
                    ),
                )
            )
        except (KeyError, TypeError, ValueError):
            continue
    return tuple(reports)


def _safe_resolution_payload(
    payload: dict[str, Any] | None,
) -> dict[str, Any] | None:
    if payload is None:
        return None
    raw_answers = payload.get("owner_answers")
    if not isinstance(raw_answers, list):
        return _redact_resolution_mapping(payload)
    return {
        "owner_answers": [
            {
                "field_fingerprint": str(item.get("field_fingerprint", "")),
                "answer_text": "[REDACTED]",
                "saved_to_answer_bank": bool(item.get("saved_to_answer_bank", False)),
            }
            for item in raw_answers
            if isinstance(item, dict)
        ]
    }


def _redact_resolution_mapping(payload: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        normalized_key = key.casefold()
        if any(
            sensitive in normalized_key
            for sensitive in (
                "answer",
                "value",
                "token",
                "secret",
                "password",
                "cookie",
                "authorization",
                "credential",
            )
        ):
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = _redact_resolution_mapping(value)
        elif isinstance(value, list):
            redacted[key] = [
                _redact_resolution_mapping(item) if isinstance(item, dict) else item
                for item in value
            ]
        else:
            redacted[key] = value
    return redacted


def _map_exception_read(exc: ApplicationException) -> ApplicationExceptionRead:
    return ApplicationExceptionRead(
        id=exc.id,
        run_id=exc.run_id,
        exception_type=exc.exception_type,
        status=exc.status,
        context_payload=exc.context_payload,
        field_reports=_extract_exception_field_reports(exc.context_payload),
        resolution_payload=_safe_resolution_payload(exc.resolution_payload),
        created_at=exc.created_at,
        resolved_at=exc.resolved_at,
    )


def _map_evidence_read(ev: EvidenceArtifact) -> EvidenceArtifactRead:
    return EvidenceArtifactRead(
        id=ev.id,
        run_id=ev.run_id,
        attempt=ev.attempt,
        evidence_type=ev.evidence_type,
        relative_path=ev.relative_path,
        sha256=ev.sha256,
        file_size_bytes=ev.file_size_bytes,
        captured_at=ev.captured_at,
        metadata_payload=ev.metadata_payload,
    )


def _map_run_read(run: ApplicationRun) -> ApplicationRunRead:
    return ApplicationRunRead(
        id=run.id,
        applicant_profile_id=run.applicant_profile_id,
        batch_id=run.batch_id,
        batch_item_id=run.batch_item_id,
        job_group_id=run.job_group_id,
        source_posting_id=run.source_posting_id,
        canonical_application_url=run.canonical_application_url,
        application_url=run.application_url,
        platform_adapter_id=run.platform_adapter_id,
        resume_asset_id=run.resume_asset_id,
        resume_sha256=run.resume_sha256,
        applicant_profile_version=run.applicant_profile_version,
        answer_bank_snapshot=run.answer_bank_snapshot,
        answer_bank_hash=run.answer_bank_hash,
        automation_mode=run.automation_mode,
        automatic_submission_authorized_at=(run.automatic_submission_authorized_at),
        automatic_submission_authorized=run.automatic_submission_authorized,
        status=run.status,
        current_step=run.current_step,
        current_checkpoint=run.current_checkpoint,
        submit_attempted_at=run.submit_attempted_at,
        attempt_count=run.attempt_count,
        retry_failure_count=run.retry_failure_count,
        max_retries=run.max_retries,
        idempotency_key=run.idempotency_key,
        terminal_reason=run.terminal_reason,
        receipt_summary=_map_receipt_read(run.receipt_summary),
        policy_snapshot=run.policy_snapshot,
        duplicate_override_confirmed_at=run.duplicate_override_confirmed_at,
        duplicate_override_reason=run.duplicate_override_reason,
        created_at=run.created_at,
        updated_at=run.updated_at,
        started_at=run.started_at,
        completed_at=run.completed_at,
    )


def _map_run_detail(
    run: ApplicationRun,
    events: Sequence[ApplicationRunEvent] | None = None,
    exceptions: Sequence[ApplicationException] | None = None,
    evidence: Sequence[EvidenceArtifact] | None = None,
) -> ApplicationRunDetailRead:
    base = _map_run_read(run)
    evts = events if events is not None else run.events
    excs = exceptions if exceptions is not None else run.exceptions
    evid = evidence if evidence is not None else run.evidence
    return ApplicationRunDetailRead(
        **base.model_dump(),
        events=tuple(_map_event_read(e) for e in evts),
        exceptions=tuple(_map_exception_read(ex) for ex in excs),
        evidence=tuple(_map_evidence_read(ev) for ev in evid),
    )


def _map_batch_read(batch: ApplicationBatch) -> ApplicationBatchRead:
    return ApplicationBatchRead(
        id=batch.id,
        origin=batch.origin,
        applicant_profile_id=batch.applicant_profile_id,
        applicant_profile_version=batch.authorization.applicant_profile_version,
        resume_asset_id=batch.authorization.resume_asset_id,
        resume_asset_version=batch.authorization.resume_asset_version,
        resume_sha256=batch.authorization.resume_sha256,
        answer_bank_snapshot=batch.authorization.answer_bank_snapshot,
        answer_bank_hash=batch.authorization.answer_bank_hash,
        automation_mode=batch.authorization.automation_mode,
        known_capability_exceptions=batch.authorization.known_capability_exceptions,
        policy_revision=batch.authorization.policy_revision,
        confirmation_text_revision=batch.authorization.confirmation_text_revision,
        confirmation_text=batch.authorization.confirmation_text,
        owner_confirmed_at=batch.authorization.owner_confirmed_at,
        counters=ApplicationBatchCountersRead(
            queued=batch.counters.queued,
            running=batch.counters.running,
            needs_attention=batch.counters.needs_attention,
            submitted=batch.counters.submitted,
            failed=batch.counters.failed,
            cancelled=batch.counters.cancelled,
        ),
        items=tuple(
            ApplicationBatchItemRead(
                id=item.id,
                batch_id=item.batch_id,
                position=item.position,
                run_id=item.run_id,
                job_group_id=item.snapshot.job_group_id,
                application_target_id=item.snapshot.application_target_id,
                source_posting_id=item.snapshot.source_posting_id,
                canonical_application_url=item.snapshot.canonical_application_url,
                application_url=item.snapshot.application_url,
                platform_adapter_id=item.snapshot.platform_adapter_id,
                duplicate_override_reason=item.snapshot.duplicate_override_reason,
                run_status=item.run_status,
                created_at=item.created_at,
            )
            for item in batch.items
        ),
        created_at=batch.created_at,
        updated_at=batch.updated_at,
    )


# --- User-Facing Endpoints ---


@application_batches_router.post(
    "/profiles/{profile_id}/application-batches/preview",
    response_model=ApplicationBatchPreviewResponse,
)
async def preview_application_batch(
    profile_id: UUID,
    request: ApplicationBatchPreviewRequest,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationBatchPreviewResponse:
    preview = await service.preview_batch(
        profile_id,
        application_target_ids=request.application_target_ids,
        resume_id=request.resume_id,
        applicant_profile_version=request.applicant_profile_version,
        resume_version=request.resume_version,
        automation_mode=request.automation_mode,
        duplicate_overrides=tuple(
            ApplicationBatchDuplicateOverride(
                application_target_id=item.application_target_id,
                reason=item.reason,
            )
            for item in request.duplicate_overrides
        ),
    )
    return ApplicationBatchPreviewResponse(
        confirmation_text=preview.confirmation_text,
        confirmation_revision=preview.confirmation_revision,
        policy_revision=preview.policy_revision,
        max_batch_size=preview.max_batch_size,
        applicant_profile_id=preview.applicant_profile_id,
        applicant_profile_version=preview.applicant_profile_version,
        resume_asset_id=preview.resume_asset_id,
        resume_asset_version=preview.resume_asset_version,
        resume_sha256=preview.resume_sha256,
        answer_bank_hash=preview.answer_bank_hash,
        answer_bank_snapshot=preview.answer_bank_snapshot,
        issues=tuple(
            ApplicationBatchPreviewIssueRead(
                code=issue.code,
                severity=issue.severity,
                message=issue.message,
                application_target_id=issue.application_target_id,
                existing_run_id=issue.existing_run_id,
            )
            for issue in preview.issues
        ),
        resolved_targets=tuple(
            ApplicationBatchResolvedTargetRead(
                application_target_id=target.application_target_id,
                job_group_id=target.job_group_id,
                source_posting_id=target.source_posting_id,
                canonical_application_url=target.canonical_application_url,
                application_url=target.application_url,
                platform_adapter_id=target.platform_adapter_id,
            )
            for target in preview.resolved_targets
        ),
    )


@application_batches_router.post(
    "/profiles/{profile_id}/application-batches",
    response_model=ApplicationBatchRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_application_batch(
    profile_id: UUID,
    request: ApplicationBatchCreateRequest,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> Any:
    try:
        batch = await service.authorize_batch(
            profile_id,
            application_target_ids=request.application_target_ids,
            resume_id=request.resume_id,
            applicant_profile_version=request.applicant_profile_version,
            resume_version=request.resume_version,
            automation_mode=request.automation_mode,
            confirmation_revision=request.confirmation_revision,
            owner_confirmation=request.owner_confirmation,
            duplicate_overrides=tuple(
                ApplicationBatchDuplicateOverride(
                    application_target_id=item.application_target_id,
                    reason=item.reason,
                )
                for item in request.duplicate_overrides
            ),
        )
    except ApplicationBatchValidationError as exc:
        if exc.conflicts and all(
            issue.code.value == "DUPLICATE_ACTIVE_RUN" for issue in exc.issues
        ):
            return JSONResponse(
                status_code=status.HTTP_409_CONFLICT,
                content={
                    "detail": "Duplicate application conflict",
                    "conflicts": [
                        conflict.model_dump(mode="json") for conflict in exc.conflicts
                    ],
                    "issues": [
                        {
                            "code": issue.code.value,
                            "severity": issue.severity.value,
                            "message": issue.message,
                            "application_target_id": (
                                str(issue.application_target_id)
                                if issue.application_target_id
                                else None
                            ),
                            "existing_run_id": (
                                str(issue.existing_run_id)
                                if issue.existing_run_id
                                else None
                            ),
                        }
                        for issue in exc.issues
                    ],
                },
            )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={
                "message": str(exc),
                "issues": [
                    {
                        "code": issue.code.value,
                        "severity": issue.severity.value,
                        "message": issue.message,
                        "application_target_id": (
                            str(issue.application_target_id)
                            if issue.application_target_id
                            else None
                        ),
                        "existing_run_id": (
                            str(issue.existing_run_id)
                            if issue.existing_run_id
                            else None
                        ),
                    }
                    for issue in exc.issues
                ],
            },
        ) from exc
    except ApplicationTargetRejectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"reason_code": exc.reason_code, "message": exc.message},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return _map_batch_read(batch)


@application_batches_router.get(
    "/profiles/{profile_id}/application-batches",
    response_model=ApplicationBatchListResponse,
)
async def list_application_batches(
    profile_id: UUID,
    service: Annotated[ApplicationService, Depends(get_application_service)],
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
) -> ApplicationBatchListResponse:
    batches, total = await service.list_batches(
        profile_id, page=page, page_size=page_size
    )
    total_pages = ceil(total / page_size) if page_size else 0
    return ApplicationBatchListResponse(
        items=tuple(_map_batch_read(batch) for batch in batches),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@application_batches_router.get(
    "/profiles/{profile_id}/application-batches/{batch_id}",
    response_model=ApplicationBatchRead,
)
async def get_application_batch(
    profile_id: UUID,
    batch_id: UUID,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationBatchRead:
    batch = await service.get_batch(profile_id, batch_id)
    if batch is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Batch not found"
        )
    return _map_batch_read(batch)


@application_batches_router.post(
    "/profiles/{profile_id}/application-batches/{batch_id}/cancel",
    response_model=ApplicationBatchRead,
)
async def cancel_application_batch(
    profile_id: UUID,
    batch_id: UUID,
    request: CancelBatchRequest,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationBatchRead:
    try:
        batch = await service.cancel_batch(profile_id, batch_id, reason=request.reason)
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except Exception as exc:
        # InvalidStateTransitionError from already-terminal items is skipped in repo
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    return _map_batch_read(batch)


@application_runs_router.post(
    "",
    response_model=ApplicationRunCreateResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_application_runs(
    request: ApplicationRunCreateRequest,
    service: Annotated[ApplicationService, Depends(get_application_service)],
    profile_id: Annotated[UUID | None, Query()] = None,
) -> Any:
    try:
        created, conflicts = await service.create_runs(request, profile_id=profile_id)
    except ApplicationTargetRejectedError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"reason_code": exc.reason_code, "message": exc.message},
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc

    response_data = ApplicationRunCreateResponse(
        created_runs=tuple(_map_run_read(r) for r in created),
        conflicts=conflicts,
    )

    if not created and conflicts:
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content=response_data.model_dump(mode="json"),
        )

    return response_data


@application_runs_router.get(
    "",
    response_model=ApplicationRunListResponse,
)
async def list_application_runs(
    status_filter: Annotated[
        list[ApplicationRunStatus] | None, Query(alias="status")
    ] = None,
    mode_filter: Annotated[list[AutomationMode] | None, Query(alias="mode")] = None,
    job_group_id: Annotated[UUID | None, Query()] = None,
    platform_adapter_id: Annotated[str | None, Query()] = None,
    profile_id: Annotated[UUID | None, Query(alias="profile_id")] = None,
    created_after: Annotated[datetime | None, Query()] = None,
    created_before: Annotated[datetime | None, Query()] = None,
    page: Annotated[int, Query(ge=1)] = 1,
    page_size: Annotated[int, Query(ge=1, le=100)] = 25,
    service: Annotated[ApplicationService, Depends(get_application_service)] = None,  # type: ignore[assignment]
) -> ApplicationRunListResponse:
    offset = (page - 1) * page_size
    criteria = ApplicationRunFilterCriteria(
        applicant_profile_id=profile_id,
        statuses=tuple(status_filter) if status_filter else (),
        modes=tuple(mode_filter) if mode_filter else (),
        job_group_id=job_group_id,
        platform_adapter_id=platform_adapter_id,
        created_after=created_after,
        created_before=created_before,
        offset=offset,
        limit=page_size,
    )
    runs, total = await service.list_runs(criteria)
    total_pages = ceil(total / page_size) if total > 0 else 1
    return ApplicationRunListResponse(
        items=tuple(_map_run_read(r) for r in runs),
        total=total,
        page=page,
        page_size=page_size,
        total_pages=total_pages,
    )


@application_runs_router.get(
    "/events/stream",
)
async def stream_all_events(
    run_id: Annotated[UUID | None, Query()] = None,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
    service: Annotated[ApplicationService, Depends(get_application_service)] = None,  # type: ignore[assignment]
) -> StreamingResponse:
    return StreamingResponse(
        service.stream_events(last_event_id=last_event_id, run_id=run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@application_runs_router.get(
    "/{run_id}",
    response_model=ApplicationRunDetailRead,
)
async def get_application_run_detail(
    run_id: UUID,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunDetailRead:
    run = await service.get_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application run {run_id} not found",
        )
    return _map_run_detail(run)


@application_runs_router.get(
    "/{run_id}/events/stream",
)
async def stream_run_events(
    run_id: UUID,
    last_event_id: Annotated[str | None, Header(alias="Last-Event-ID")] = None,
    service: Annotated[ApplicationService, Depends(get_application_service)] = None,  # type: ignore[assignment]
) -> StreamingResponse:
    run = await service.get_run(run_id)
    if run is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Application run {run_id} not found",
        )
    return StreamingResponse(
        service.stream_events(last_event_id=last_event_id, run_id=run_id),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@application_runs_router.post(
    "/{run_id}/resolve-answers",
    response_model=ApplicationRunDetailRead,
)
async def resolve_run_answers(
    run_id: UUID,
    request: ResolveAnswersRequest,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunDetailRead:
    try:
        updated = await service.resolve_answers(run_id, request)
        return _map_run_detail(updated)
    except ResourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@application_runs_router.post(
    "/{run_id}/release-submit",
    response_model=ApplicationRunDetailRead,
)
async def release_run_submit(
    run_id: UUID,
    request: ReleaseSubmitRequest,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunDetailRead:
    try:
        updated = await service.release_submit(run_id, request)
        return _map_run_detail(updated)
    except SubmitArmedRequirementError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@application_runs_router.post(
    "/{run_id}/resume",
    response_model=ApplicationRunDetailRead,
)
async def resume_run(
    run_id: UUID,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunDetailRead:
    try:
        updated = await service.resume_run(run_id)
        return _map_run_detail(updated)
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@application_runs_router.post(
    "/{run_id}/cancel",
    response_model=ApplicationRunDetailRead,
)
async def cancel_run(
    run_id: UUID,
    request: CancelRunRequest | None = None,
    service: Annotated[ApplicationService, Depends(get_application_service)] = None,  # type: ignore[assignment]
) -> ApplicationRunDetailRead:
    try:
        reason = request.reason if request else None
        updated = await service.cancel_run(run_id, reason)
        return _map_run_detail(updated)
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@application_runs_router.post(
    "/{run_id}/duplicate-override",
    response_model=ApplicationRunDetailRead,
)
async def override_duplicate_run(
    run_id: UUID,
    request: DuplicateOverrideInput,
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunDetailRead:
    try:
        updated = await service.override_duplicate(
            run_id, request.owner_confirmation, request.reason
        )
        return _map_run_detail(updated)
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


# --- Runner-Facing Endpoints ---


@runner_router.post(
    "/claims",
    response_model=RunnerClaimResponse | None,
    dependencies=[Depends(verify_runner_secret)],
)
async def claim_runner_lease(
    service: Annotated[ApplicationService, Depends(get_application_service)],
    request: RunnerClaimRequest | None = None,
    x_runner_id: Annotated[str, Header(alias="X-Runner-Id")] = "runner_default",
) -> Any:
    claimed = await service.claim_run(
        runner_id=x_runner_id,
        run_id=request.run_id if request else None,
    )
    if claimed is None:
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    run, lease_token, grant_token, expires_at = claimed
    return RunnerClaimResponse(
        run=_map_run_read(run),
        lease_token=lease_token,
        grant_token=grant_token,
        lease_expires_at=expires_at,
    )


@runner_router.post(
    "/runs/{run_id}/heartbeat",
    response_model=ApplicationRunRead,
    dependencies=[Depends(verify_runner_secret)],
)
async def heartbeat_runner_lease(
    run_id: UUID,
    request: RunnerHeartbeatRequest,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunRead:
    try:
        updated = await service.heartbeat(
            run_id=run_id,
            lease_token=lease_token,
            extend_seconds=request.extend_seconds,
        )
        return _map_run_read(updated)
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@runner_router.post(
    "/runs/{run_id}/release-claim",
    response_model=ApplicationRunRead,
    dependencies=[Depends(verify_runner_secret)],
)
async def release_runner_claim(
    run_id: UUID,
    request: RunnerReleaseClaimRequest,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
    idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None,
    x_runner_id: Annotated[str, Header(alias="X-Runner-Id")] = "runner_default",
) -> ApplicationRunRead:
    if not idempotency_key:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Idempotency-Key header",
        )
    try:
        updated = await service.release_claim(
            run_id=run_id,
            lease_token=lease_token,
            runner_id=x_runner_id,
            reason=request.reason,
            request_id=idempotency_key,
        )
        return _map_run_read(updated)
    except ClaimNotReleasableError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@runner_router.post(
    "/runs/{run_id}/events",
    response_model=ApplicationRunEventRead,
    dependencies=[Depends(verify_runner_secret)],
)
async def post_runner_event(
    run_id: UUID,
    request: RunnerEventRequest,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunEventRead:
    try:
        event = await service.post_event(
            run_id=run_id,
            lease_token=lease_token,
            attempt=request.attempt,
            sequence_num=request.sequence_num,
            event_type=request.event_type,
            event_payload=request.event_payload,
            idempotency_key=request.idempotency_key,
        )
        return _map_event_read(event)
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@runner_router.post(
    "/runs/{run_id}/checkpoints",
    response_model=ApplicationRunRead,
    dependencies=[Depends(verify_runner_secret)],
)
async def post_runner_checkpoint(
    run_id: UUID,
    request: RunnerCheckpointRequest,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunRead:
    try:
        chk_val = (
            request.checkpoint.value
            if isinstance(request.checkpoint, RunCheckpoint)
            else str(request.checkpoint)
        )
        updated = await service.record_checkpoint(
            run_id=run_id,
            lease_token=lease_token,
            checkpoint=chk_val,
            step_description=request.step_description,
        )
        return _map_run_read(updated)
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except SubmissionDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc


@runner_router.post(
    "/runs/{run_id}/exceptions",
    response_model=ApplicationExceptionRead,
    dependencies=[Depends(verify_runner_secret)],
)
async def post_runner_exception(
    run_id: UUID,
    request: RunnerExceptionRequest,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationExceptionRead:
    try:
        exc = await service.raise_exception(
            run_id=run_id,
            lease_token=lease_token,
            exception_type=request.exception_type,
            context_payload=request.context_payload,
        )
        return _map_exception_read(exc)
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc


@runner_router.post(
    "/runs/{run_id}/complete",
    response_model=ApplicationRunRead,
    dependencies=[Depends(verify_runner_secret)],
)
async def complete_runner_run(
    run_id: UUID,
    request: RunnerCompleteRequest,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> ApplicationRunRead:
    try:
        receipt_summary: ReceiptSummary | None = None
        if request.receipt:
            receipt_summary = ReceiptSummary(
                platform_adapter_id=request.receipt.platform_adapter_id,
                final_url=request.receipt.final_url,
                platform_receipt_id=request.receipt.platform_receipt_id,
                confirmation_signal=request.receipt.confirmation_signal,
                capture_timestamp=request.receipt.capture_timestamp,
                artifact_hash=request.receipt.artifact_hash,
                summary_notes=request.receipt.summary_notes,
            )

        updated = await service.complete_run(
            run_id=run_id,
            lease_token=lease_token,
            terminal_status=request.terminal_status,
            terminal_reason=request.terminal_reason,
            receipt=receipt_summary,
        )
        return _map_run_read(updated)
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except SubmissionDeniedError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@runner_router.post(
    "/runs/{run_id}/evidence",
    response_model=EvidenceUploadResponse,
    dependencies=[Depends(verify_runner_secret)],
)
async def upload_runner_evidence(
    run_id: UUID,
    file: Annotated[UploadFile, File()],
    attempt: Annotated[int, Form()],
    evidence_type: Annotated[EvidenceType, Form()],
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
    metadata_json: Annotated[str | None, Form()] = None,
) -> EvidenceUploadResponse:
    try:
        file_bytes = await file.read()
        metadata = json.loads(metadata_json) if metadata_json else None
        artifact = await service.store_evidence(
            run_id=run_id,
            lease_token=lease_token,
            attempt=attempt,
            evidence_type=evidence_type,
            file_bytes=file_bytes,
            filename=file.filename or "evidence.bin",
            metadata_payload=metadata,
        )
        return EvidenceUploadResponse(
            id=artifact.id,
            relative_path=artifact.relative_path,
            sha256=artifact.sha256,
            file_size_bytes=artifact.file_size_bytes or len(file_bytes),
        )
    except LeaseExpiredOrInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc


@runner_router.get(
    "/runs/{run_id}/resume-asset",
    dependencies=[Depends(verify_runner_secret)],
)
async def download_resume_asset(
    run_id: UUID,
    grant_token: Annotated[str, Depends(get_resume_grant_token)],
    service: Annotated[ApplicationService, Depends(get_application_service)],
) -> FileResponse:
    try:
        resume_path, sha256, filename = await service.get_resume_asset_for_grant(
            run_id=run_id, grant_token=grant_token
        )
        return FileResponse(
            path=str(resume_path),
            media_type="application/pdf",
            filename=filename,
            headers={"X-Resume-Sha256": sha256},
        )
    except GrantAlreadyConsumedError as exc:
        raise HTTPException(status_code=status.HTTP_410_GONE, detail=str(exc)) from exc
    except GrantExpiredError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
        ) from exc
    except ResourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ApplicationRunNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)
        ) from exc
