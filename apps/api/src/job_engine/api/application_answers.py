from __future__ import annotations

from decimal import Decimal
from typing import Annotated, cast
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from job_engine.api.applications import get_runner_lease_token, verify_runner_secret
from job_engine.api.dependencies import get_settings
from job_engine.api.schemas import (
    AnswerDecisionRequest,
    AnswerDecisionResponse,
    AnswerDecisionSchema,
    EvidenceReferenceSchema,
    QuestionObservationSchema,
)
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    ApplicationRepository,
    CatalogRepository,
)
from job_engine.domain.applicant import ResumeAsset
from job_engine.domain.application_answers import (
    ControlType,
    ObservationValidationConstraints,
    QuestionObservation,
)
from job_engine.services.application_answers import (
    ApplicationAnswerService,
    ApplicationRunNotFoundError,
    LeaseInvalidOrExpiredError,
    StaleRunContextError,
    authorize_run_for_answers,
    build_job_evidence,
)

router = APIRouter(prefix="/runner", tags=["runner", "application-answers"])


def get_application_answer_service(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApplicationAnswerService:
    existing = getattr(request.app.state, "application_answer_service", None)
    if existing is not None:
        return cast(ApplicationAnswerService, existing)

    session_factory = request.app.state.session_factory

    async def reserve_budget(run_id: UUID, estimated_cost: Decimal) -> bool:
        async with session_factory() as session:
            repo = ApplicationRepository(session)
            reserved = await repo.reserve_provider_budget(
                run_id,
                estimated_cost,
                max_calls_per_run=settings.answer_provider_max_calls_per_run,
                run_cost_cap_usd=settings.answer_run_cost_cap_usd,
                batch_cost_cap_usd=settings.answer_batch_cost_cap_usd,
            )
            await session.commit()
            return reserved

    service = ApplicationAnswerService(settings, budget_reserver=reserve_budget)
    request.app.state.application_answer_service = service
    return service


async def _load_resume_by_id(
    vault_repo: ApplicantVaultRepository, resume_asset_id: UUID
) -> ResumeAsset | None:
    resumes = await vault_repo.list_resumes()
    return next((r for r in resumes if r.id == resume_asset_id), None)


def _to_domain_observation(
    run_id: UUID, schema: QuestionObservationSchema
) -> QuestionObservation:
    constraints = (
        ObservationValidationConstraints(
            min_length=schema.validation_constraints.min_length,
            max_length=schema.validation_constraints.max_length,
            pattern=schema.validation_constraints.pattern,
        )
        if schema.validation_constraints is not None
        else None
    )
    return QuestionObservation(
        run_id=run_id,
        adapter_id=schema.adapter_id,
        page_id=schema.page_id,
        field_fingerprint=schema.field_fingerprint,
        label=schema.label,
        accessible_name=schema.accessible_name,
        help_text=schema.help_text,
        required=schema.required,
        control_type=ControlType(schema.control_type.value),
        options=schema.options,
        validation_constraints=constraints,
    )


@router.post(
    "/runs/{run_id}/answer-decisions",
    response_model=AnswerDecisionResponse,
    dependencies=[Depends(verify_runner_secret)],
)
async def submit_answer_decisions(
    run_id: UUID,
    request: AnswerDecisionRequest,
    http_request: Request,
    lease_token: Annotated[str, Depends(get_runner_lease_token)],
    answer_service: Annotated[
        ApplicationAnswerService, Depends(get_application_answer_service)
    ],
) -> AnswerDecisionResponse:
    fingerprints_seen: set[str] = set()
    for obs in request.observations:
        if obs.field_fingerprint in fingerprints_seen:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Duplicate field_fingerprint in request: {obs.field_fingerprint}"
                ),
            )
        fingerprints_seen.add(obs.field_fingerprint)

    session_factory = http_request.app.state.session_factory
    async with session_factory() as session:
        app_repo = ApplicationRepository(session)
        vault_repo = ApplicantVaultRepository(session)
        catalog_repo = CatalogRepository(session)

        run = await app_repo.get_run(run_id)
        profile = await vault_repo.get_profile()
        resume = (
            await _load_resume_by_id(vault_repo, run.resume_asset_id)
            if run is not None
            else None
        )
        answer_bank = await vault_repo.list_answers()
        job_group = (
            await catalog_repo.get_job_group(run.job_group_id)
            if run is not None
            else None
        )

        if job_group is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Job group for run {run_id} not found",
            )
        job_evidence = build_job_evidence(job_group)

        try:
            context = authorize_run_for_answers(
                run,
                lease_token,
                profile=profile,
                resume=resume,
                answer_bank=answer_bank,
                job_evidence=job_evidence,
            )
        except ApplicationRunNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)
            ) from exc
        except LeaseInvalidOrExpiredError as exc:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=str(exc)
            ) from exc
        except StaleRunContextError as exc:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail=str(exc)
            ) from exc

    observations = tuple(
        _to_domain_observation(run_id, obs) for obs in request.observations
    )
    decisions = await answer_service.decide(context, observations)

    return AnswerDecisionResponse(
        decisions=tuple(
            AnswerDecisionSchema(
                field_fingerprint=d.field_fingerprint,
                decision=d.decision,
                answer=d.answer,
                policy_category=d.policy_category,
                confidence=d.confidence,
                evidence=tuple(
                    EvidenceReferenceSchema(source=e.source, reference=e.reference)
                    for e in d.evidence
                ),
                reason_code=d.reason_code,
                question_intent=d.question_intent,
            )
            for d in decisions
        )
    )
