from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.api.dependencies import get_session, get_settings
from job_engine.api.schemas import (
    AnswerBankListResponse,
    ApplicantProfileRead,
    ApplicantProfileUpsertRequest,
    ProfileFieldDiffSchema,
    ResumeAssetCreateRequest,
    ResumeAssetPatchRequest,
    ResumeAssetRead,
    ResumeImportProposalResponse,
    ResumeImportRequest,
    ResumeListResponse,
    ReusableAnswerCreateRequest,
    ReusableAnswerRead,
    ReusableAnswerUpdateRequest,
)
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    DefaultResumeConflictError,
    OptimisticLockError,
    ResourceNotFoundError,
)
from job_engine.domain.applicant import (
    ApplicantProfileInput,
    ConfirmedField,
    QuestionIntent,
    ResumeAssetInput,
    ReusableAnswerInput,
)
from job_engine.services.applicant import (
    ApplicantService,
    ResumeFileValidationError,
)

router = APIRouter(tags=["applicant"])


def get_applicant_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApplicantService:
    repo = ApplicantVaultRepository(session)
    return ApplicantService(repo, settings.resolved_resume_root)


@router.get("/applicant-profile", response_model=ApplicantProfileRead)
async def get_applicant_profile(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    profile = await service.get_profile()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Applicant profile has not been created",
        )
    return ApplicantProfileRead.model_validate(profile, from_attributes=True)


@router.put("/applicant-profile", response_model=ApplicantProfileRead)
async def upsert_applicant_profile(
    request: ApplicantProfileUpsertRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    # Build domain ApplicantProfileInput from request fields
    field_kwargs = {}
    for name in [
        "first_name",
        "last_name",
        "email",
        "phone",
        "city",
        "region",
        "country",
        "timezone",
        "headline",
        "summary",
        "portfolio_url",
        "linkedin_url",
        "github_url",
        "custom_urls",
        "notice_period_days",
        "employment_history",
        "education_history",
        "skills",
        "languages",
        "certifications",
        "work_authorizations",
        "compensation_expectation",
        "location_preferences",
        "demographics",
    ]:
        val = getattr(request, name)
        field_kwargs[name] = ConfirmedField(
            state=val.state,
            value=val.value,
            source=val.source,
            last_confirmed_at=val.last_confirmed_at,
            policy_category=val.policy_category,
        )

    profile_input = ApplicantProfileInput(**field_kwargs)
    try:
        updated = await service.replace_profile(profile_input, request.expected_version)
    except OptimisticLockError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err

    return ApplicantProfileRead.model_validate(updated, from_attributes=True)


@router.post(
    "/applicant-profile/import-resume",
    response_model=ResumeImportProposalResponse,
)
async def import_resume_preview(
    request: ResumeImportRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeImportProposalResponse:
    try:
        proposal = await service.import_resume_preview(request.source_markdown_path)
    except ResumeFileValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err
    except Exception as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=f"Failed to parse resume: {err}",
        ) from err

    diffs = tuple(
        ProfileFieldDiffSchema(
            field_path=d.field_path,
            status=d.status,
            current_value=d.current_value,
            proposed_value=d.proposed_value,
            message=d.message,
        )
        for d in proposal.diffs
    )
    return ResumeImportProposalResponse(
        source_markdown_path=proposal.source_markdown_path,
        generated_at=proposal.generated_at,
        diffs=diffs,
    )


@router.get("/resumes", response_model=ResumeListResponse)
async def list_resumes(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeListResponse:
    resumes = await service.list_resumes()
    return ResumeListResponse(
        items=tuple(
            ResumeAssetRead.model_validate(r, from_attributes=True) for r in resumes
        )
    )


@router.post(
    "/resumes",
    response_model=ResumeAssetRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_resume(
    request: ResumeAssetCreateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeAssetRead:
    domain_input = ResumeAssetInput(
        resume_id=request.resume_id,
        label=request.label,
        source_markdown_path=request.source_markdown_path,
        upload_pdf_path=request.upload_pdf_path,
        preview_html_path=request.preview_html_path,
        language=request.language,
        is_default=request.is_default,
    )
    try:
        created = await service.register_resume(domain_input)
    except ResumeFileValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    return ResumeAssetRead.model_validate(created, from_attributes=True)


@router.patch("/resumes/{resume_id}", response_model=ResumeAssetRead)
async def patch_resume(
    resume_id: str,
    request: ResumeAssetPatchRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeAssetRead:
    try:
        updated = await service.patch_resume(
            resume_id,
            label=request.label,
            is_default=request.is_default,
            refresh_checksum=request.refresh_checksum,
            expected_version=request.expected_version,
        )
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except OptimisticLockError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except DefaultResumeConflictError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except ResumeFileValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    return ResumeAssetRead.model_validate(updated, from_attributes=True)


@router.delete("/resumes/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_resume(
    resume_id: str,
    expected_version: Annotated[int, Query(...)],
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    try:
        await service.delete_resume(resume_id, expected_version=expected_version)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except OptimisticLockError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except DefaultResumeConflictError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err


@router.get("/answer-bank", response_model=AnswerBankListResponse)
async def list_answers(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    question_intent: QuestionIntent | None = None,
    jurisdiction: str | None = None,
    platform_scope: str | None = None,
) -> AnswerBankListResponse:
    answers = await service.list_answers(
        question_intent=question_intent,
        jurisdiction=jurisdiction,
        platform_scope=platform_scope,
    )
    return AnswerBankListResponse(
        items=tuple(
            ReusableAnswerRead.model_validate(a, from_attributes=True) for a in answers
        )
    )


@router.post(
    "/answer-bank",
    response_model=ReusableAnswerRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_answer(
    request: ReusableAnswerCreateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    domain_input = ReusableAnswerInput(
        answer_id=request.answer_id,
        question_intent=request.question_intent,
        jurisdiction=request.jurisdiction,
        platform_scope=request.platform_scope,
        answer_text=request.answer_text,
        policy_category=request.policy_category,
        provenance=request.provenance,
        last_confirmed_at=request.last_confirmed_at,
        expires_at=request.expires_at,
    )
    try:
        created = await service.create_answer(domain_input)
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    return ReusableAnswerRead.model_validate(created, from_attributes=True)


@router.put("/answer-bank/{answer_id}", response_model=ReusableAnswerRead)
async def update_answer(
    answer_id: str,
    request: ReusableAnswerUpdateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    domain_input = ReusableAnswerInput(
        answer_id=answer_id,
        question_intent=request.question_intent,
        jurisdiction=request.jurisdiction,
        platform_scope=request.platform_scope,
        answer_text=request.answer_text,
        policy_category=request.policy_category,
        provenance=request.provenance,
        last_confirmed_at=request.last_confirmed_at,
        expires_at=request.expires_at,
    )
    try:
        updated = await service.update_answer(
            answer_id, domain_input, expected_version=request.expected_version
        )
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except OptimisticLockError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    return ReusableAnswerRead.model_validate(updated, from_attributes=True)


@router.delete("/answer-bank/{answer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_answer(
    answer_id: str,
    expected_version: Annotated[int, Query(...)],
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    try:
        await service.delete_answer(answer_id, expected_version=expected_version)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except OptimisticLockError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
