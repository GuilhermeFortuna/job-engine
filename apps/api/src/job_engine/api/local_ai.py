"""Local-AI status, self-test, readiness, and resume proposal API routes."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.api.dependencies import get_session, get_settings
from job_engine.api.schemas import (
    ApplicantProfileRead,
    LocalAiProposalAcceptRequest,
    LocalAiProposalAcceptResponse,
    LocalAiProposalCreateRequest,
    LocalAiProposalDeclineRequest,
    LocalAiProposalRead,
    LocalAiReadinessRead,
    LocalAiSelfTestRead,
    LocalAiStatusRead,
    ProposedFieldSchema,
    SourceSpanSchema,
)
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    LocalAiRepository,
    OptimisticLockError,
    ResourceNotFoundError,
)
from job_engine.domain.applicant import ApplicantProfile
from job_engine.domain.local_ai import LocalAiError, ResumeProfileProposal
from job_engine.services.local_ai import LocalAiService
from job_engine.services.local_inference import LocalInferenceBroker

router = APIRouter(tags=["local-ai"])


def _profile_to_read(profile: ApplicantProfile) -> ApplicantProfileRead:
    return ApplicantProfileRead.model_validate(profile, from_attributes=True)


def _proposal_to_read(proposal: ResumeProfileProposal) -> LocalAiProposalRead:
    return LocalAiProposalRead(
        id=proposal.id,
        profile_id=proposal.profile_id,
        source_asset_id=proposal.source_asset_id,
        source_asset_sha256=proposal.source_asset_sha256,
        status=proposal.status.value,
        schema_revision=proposal.schema_revision,
        prompt_revision=proposal.prompt_revision,
        model=proposal.model,
        fields=tuple(
            ProposedFieldSchema(
                field_path=field.field_path,
                value=field.value,
                evidence=tuple(
                    SourceSpanSchema(
                        start=span.start, end=span.end, excerpt=span.excerpt
                    )
                    for span in field.evidence
                ),
                confidence=field.confidence,
            )
            for field in proposal.fields
        ),
        failure_code=proposal.failure_code.value if proposal.failure_code else None,
        deterministic_extraction_ok=proposal.deterministic_extraction_ok,
        accepted_field_paths=proposal.accepted_field_paths,
        created_at=proposal.created_at,
        updated_at=proposal.updated_at,
    )


def get_local_inference_broker(request: Request) -> LocalInferenceBroker | None:
    return getattr(request.app.state, "local_inference_broker", None)


def get_local_ai_service(
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> LocalAiService:
    broker = get_local_inference_broker(request)
    return LocalAiService(
        settings,
        broker,
        ApplicantVaultRepository(session),
        LocalAiRepository(session),
    )


@router.get("/local-ai/status", response_model=LocalAiStatusRead)
async def get_local_ai_status(
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiStatusRead:
    status_domain = await service.get_status()
    return LocalAiStatusRead(
        configured=status_domain.configured,
        endpoint_class=status_domain.endpoint_class,
        model=status_domain.model,
        reachable=status_domain.reachable,
        model_available=status_domain.model_available,
        schema_revision=status_domain.schema_revision,
        last_self_test_passed=status_domain.last_self_test_passed,
        last_self_test_at=status_domain.last_self_test_at,
        last_self_test_latency_ms=status_domain.last_self_test_latency_ms,
        failure_code=(
            status_domain.failure_code.value if status_domain.failure_code else None
        ),
    )


@router.post("/local-ai/self-test", response_model=LocalAiSelfTestRead)
async def run_local_ai_self_test(
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiSelfTestRead:
    record = await service.run_self_test()
    return LocalAiSelfTestRead(
        passed=record.passed,
        model=record.model,
        schema_revision=record.schema_revision,
        prompt_revision=record.prompt_revision,
        latency_ms=record.latency_ms,
        failure_code=record.failure_code.value if record.failure_code else None,
        tested_at=record.tested_at,
    )


@router.get("/local-ai/readiness", response_model=LocalAiReadinessRead)
async def get_local_ai_readiness(
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiReadinessRead:
    readiness = await service.get_readiness()
    return LocalAiReadinessRead(
        local_ai_configured=readiness.local_ai_configured,
        local_ai_ready=readiness.local_ai_ready,
        local_ai_failure_code=(
            readiness.local_ai_failure_code.value
            if readiness.local_ai_failure_code
            else None
        ),
        model=readiness.model,
        last_self_test_passed=readiness.last_self_test_passed,
        exceptions=readiness.exceptions,
    )


@router.post(
    "/profiles/{profile_id}/local-ai/resume-proposals",
    response_model=LocalAiProposalRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_resume_proposal(
    profile_id: UUID,
    body: LocalAiProposalCreateRequest,
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiProposalRead:
    try:
        proposal = await service.create_resume_proposal(
            profile_id, body.source_asset_id
        )
    except ResourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return _proposal_to_read(proposal)


@router.get(
    "/profiles/{profile_id}/local-ai/resume-proposals/{proposal_id}",
    response_model=LocalAiProposalRead,
)
async def get_resume_proposal(
    profile_id: UUID,
    proposal_id: UUID,
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiProposalRead:
    try:
        proposal = await service.get_proposal(profile_id, proposal_id)
    except ResourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    return _proposal_to_read(proposal)


@router.post(
    "/profiles/{profile_id}/local-ai/resume-proposals/{proposal_id}/accept",
    response_model=LocalAiProposalAcceptResponse,
)
async def accept_resume_proposal(
    profile_id: UUID,
    proposal_id: UUID,
    body: LocalAiProposalAcceptRequest,
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiProposalAcceptResponse:
    try:
        proposal, profile = await service.accept_proposal(
            profile_id,
            proposal_id,
            accepted_field_paths=body.accepted_field_paths,
            field_edits=body.field_edits,
            expected_profile_version=body.expected_profile_version,
            decline_remaining=body.decline_remaining,
        )
    except ResourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except OptimisticLockError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    except LocalAiError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"failure_code": exc.code.value, "message": exc.message},
        ) from exc
    return LocalAiProposalAcceptResponse(
        proposal=_proposal_to_read(proposal),
        profile=_profile_to_read(profile),
    )


@router.post(
    "/profiles/{profile_id}/local-ai/resume-proposals/{proposal_id}/decline",
    response_model=LocalAiProposalRead,
)
async def decline_resume_proposal(
    profile_id: UUID,
    proposal_id: UUID,
    body: LocalAiProposalDeclineRequest,
    service: Annotated[LocalAiService, Depends(get_local_ai_service)],
) -> LocalAiProposalRead:
    try:
        proposal = await service.decline_proposal(
            profile_id,
            proposal_id,
            expected_profile_version=body.expected_profile_version,
        )
    except ResourceNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
        ) from exc
    except OptimisticLockError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail=str(exc)
        ) from exc
    return _proposal_to_read(proposal)
