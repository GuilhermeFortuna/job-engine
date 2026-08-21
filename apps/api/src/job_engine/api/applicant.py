"""Applicant profile, resumes, answers, and managed asset API routes."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Annotated, Any
from uuid import UUID, uuid4

from fastapi import (
    APIRouter,
    Depends,
    Form,
    Header,
    HTTPException,
    Query,
    Request,
    Response,
    UploadFile,
    status,
)
from fastapi.responses import Response as RawResponse
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.datastructures import UploadFile as StarletteUploadFile

from job_engine.api.dependencies import get_session, get_settings
from job_engine.api.schemas import (
    AnswerBankListResponse,
    ApplicantProfileBaseRequest,
    ApplicantProfileCreateRequest,
    ApplicantProfileRead,
    ApplicantProfileUpdateRequest,
    ApplicantProfileUpsertRequest,
    ArchiveProfileRequest,
    AvatarCropRequest,
    AvatarResponse,
    DocumentListResponse,
    ManagedAssetRead,
    ProfileFieldDiffSchema,
    ProfileListResponse,
    ProfileSummaryRead,
    ResumeAssetCreateRequest,
    ResumeAssetPatchRequest,
    ResumeAssetRead,
    ResumeImportProposalResponse,
    ResumeImportRequest,
    ResumeListResponse,
    ReusableAnswerCreateRequest,
    ReusableAnswerRead,
    ReusableAnswerUpdateRequest,
    SetActiveProfileRequest,
)
from job_engine.config import Settings
from job_engine.db.repositories import (
    _PROFILE_FIELD_NAMES,
    ApplicantVaultRepository,
    DefaultResumeConflictError,
    OptimisticLockError,
    ProfileArchiveGuardError,
    ResourceNotFoundError,
)
from job_engine.domain.applicant import (
    ApplicantProfileInput,
    AvatarCrop,
    ConfirmedField,
    ManagedAssetType,
    QuestionIntent,
    ResumeAssetInput,
    ReusableAnswerInput,
)
from job_engine.services.applicant import (
    ApplicantService,
    ResumeFileValidationError,
)
from job_engine.services.managed_assets import (
    AssetNotFoundError,
    InvalidAssetError,
    ManagedAssetService,
    OversizeAssetError,
)

router = APIRouter(tags=["applicant"])


def get_applicant_service(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> ApplicantService:
    repo = ApplicantVaultRepository(session)
    managed_assets = ManagedAssetService(settings.resolved_data_root)
    return ApplicantService(repo, settings.resolved_resume_root, managed_assets)


def get_managed_asset_service(
    settings: Annotated[Settings, Depends(get_settings)],
) -> ManagedAssetService:
    return ManagedAssetService(settings.resolved_data_root)


def _build_profile_input(
    request: (
        ApplicantProfileCreateRequest
        | ApplicantProfileUpdateRequest
        | ApplicantProfileBaseRequest
    ),
    existing: Any = None,
) -> ApplicantProfileInput:
    field_kwargs: dict[str, Any] = {}
    for name in _PROFILE_FIELD_NAMES:
        val = getattr(request, name, None)
        if val is not None:
            field_kwargs[name] = ConfirmedField(
                state=val.state,
                value=val.value,
                source=val.source,
                last_confirmed_at=val.last_confirmed_at,
                policy_category=val.policy_category,
            )
        elif existing is not None:
            field_kwargs[name] = getattr(existing, name)
        else:
            field_kwargs[name] = ConfirmedField()

    display_name = getattr(request, "display_name", None)
    if display_name is None and existing is not None:
        display_name = existing.display_name
    elif display_name is None:
        display_name = "Default Applicant"

    avatar_asset_id = getattr(request, "avatar_asset_id", None)
    if avatar_asset_id is None and existing is not None:
        avatar_asset_id = existing.avatar_asset_id

    onboarding_step = getattr(request, "onboarding_step", None)
    if onboarding_step is None and existing is not None:
        onboarding_step = existing.onboarding_step
    elif onboarding_step is None:
        onboarding_step = "profile"

    onboarding_completed_at = getattr(request, "onboarding_completed_at", None)
    if onboarding_completed_at is None and existing is not None:
        onboarding_completed_at = existing.onboarding_completed_at

    automation_preferences = getattr(request, "automation_preferences", None)
    if automation_preferences is None and existing is not None:
        automation_preferences = existing.automation_preferences
    elif automation_preferences is None:
        automation_preferences = {}

    return ApplicantProfileInput(
        display_name=display_name,
        avatar_asset_id=avatar_asset_id,
        onboarding_step=onboarding_step,
        onboarding_completed_at=onboarding_completed_at,
        automation_preferences=automation_preferences,
        **field_kwargs,
    )


# --- Profiles Management ---


@router.get("/profiles", response_model=ProfileListResponse)
async def list_profiles(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    include_archived: bool = True,
) -> ProfileListResponse:
    profiles = await service.list_profiles(include_archived=include_archived)
    active_id = await service.get_active_profile_id()
    return ProfileListResponse(
        items=tuple(
            ProfileSummaryRead.model_validate(p, from_attributes=True) for p in profiles
        ),
        active_profile_id=active_id,
    )


@router.post(
    "/profiles",
    response_model=ApplicantProfileRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_profile(
    request: ApplicantProfileCreateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    profile_input = _build_profile_input(request)
    created = await service.create_profile(profile_input)
    return ApplicantProfileRead.model_validate(created, from_attributes=True)


@router.get("/profiles/active", response_model=ApplicantProfileRead)
async def get_active_profile(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    profile = await service.get_active_profile()
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active applicant profile configured",
        )
    return ApplicantProfileRead.model_validate(profile, from_attributes=True)


@router.put("/profiles/active", status_code=status.HTTP_200_OK)
async def set_active_profile(
    request: SetActiveProfileRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> dict[str, str]:
    try:
        await service.set_active_profile(request.profile_id)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err
    return {"status": "ok", "active_profile_id": str(request.profile_id)}


@router.get("/profiles/{profile_id}", response_model=ApplicantProfileRead)
async def get_profile(
    profile_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    profile = await service.get_profile(profile_id)
    if profile is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Applicant profile {profile_id} not found",
        )
    return ApplicantProfileRead.model_validate(profile, from_attributes=True)


@router.patch("/profiles/{profile_id}", response_model=ApplicantProfileRead)
@router.put("/profiles/{profile_id}", response_model=ApplicantProfileRead)
async def update_profile(
    profile_id: UUID,
    request: ApplicantProfileUpdateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    existing = await service.get_profile(profile_id)
    if existing is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Applicant profile {profile_id} not found",
        )

    profile_input = _build_profile_input(request, existing=existing)
    try:
        updated = await service.update_profile(
            profile_id, profile_input, request.expected_version
        )
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


@router.post("/profiles/{profile_id}/archive", response_model=ApplicantProfileRead)
async def archive_profile(
    profile_id: UUID,
    request: ArchiveProfileRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    try:
        archived = await service.archive_profile(profile_id, request.expected_version)
    except ProfileArchiveGuardError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
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

    return ApplicantProfileRead.model_validate(archived, from_attributes=True)


@router.post(
    "/profiles/{profile_id}/import-resume",
    response_model=ResumeImportProposalResponse,
)
async def import_resume_preview_for_profile(
    profile_id: UUID,
    request: ResumeImportRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeImportProposalResponse:
    try:
        proposal = await service.import_resume_preview(
            profile_id, request.source_markdown_path
        )
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


# --- Resumes Management ---


@router.get("/profiles/{profile_id}/resumes", response_model=ResumeListResponse)
async def list_resumes_for_profile(
    profile_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeListResponse:
    try:
        resumes = await service.list_resumes(profile_id)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    return ResumeListResponse(
        items=tuple(
            ResumeAssetRead.model_validate(r, from_attributes=True) for r in resumes
        )
    )


@router.post(
    "/profiles/{profile_id}/resumes",
    response_model=ResumeAssetRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_or_upload_resume(
    profile_id: UUID,
    request: Request,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    managed_assets: Annotated[ManagedAssetService, Depends(get_managed_asset_service)],
) -> ResumeAssetRead:
    content_type = request.headers.get("content-type", "")
    if content_type.startswith("multipart/form-data"):
        form = await request.form()
        file = form.get("file")
        # request.form() yields starlette.datastructures.UploadFile, which is not a
        # subclass of fastapi.UploadFile — isinstance must use the Starlette type.
        if file is not None and isinstance(file, StarletteUploadFile):

            async def file_stream() -> AsyncIterator[bytes]:
                while chunk := await file.read(65536):
                    yield chunk

            try:
                asset = await managed_assets.store_asset_stream(
                    profile_id=profile_id,
                    asset_type=ManagedAssetType.RESUME,
                    filename=file.filename or "resume.pdf",
                    content_stream=file_stream(),
                    declared_content_type=file.content_type,
                )
                created_asset = await service._repo.create_managed_asset(asset)
                r_id = form.get("resume_id") or f"res_{uuid4().hex[:8]}"
                r_label = form.get("label") or file.filename or "Resume"
                r_default = form.get("is_default") in {"true", "True", True}
                domain_input = ResumeAssetInput(
                    applicant_profile_id=profile_id,
                    resume_id=str(r_id),
                    label=str(r_label),
                    managed_asset_id=created_asset.id,
                    is_default=r_default,
                )
                created = await service.register_resume(profile_id, domain_input)
                return ResumeAssetRead.model_validate(created, from_attributes=True)
            except OversizeAssetError as err:
                raise HTTPException(
                    status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    detail=str(err),
                ) from err
            except InvalidAssetError as err:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=str(err),
                ) from err
            except Exception as err:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=str(err),
                ) from err
        else:
            raw_r_id = form.get("resume_id")
            raw_r_label = form.get("label")
            if not raw_r_id or not raw_r_label:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail="Either upload a file or supply resume metadata",
                )
            req = ResumeAssetCreateRequest(
                resume_id=str(raw_r_id),
                label=str(raw_r_label),
                is_default=form.get("is_default") in {"true", "True", True},
                managed_asset_id=(
                    UUID(str(form.get("managed_asset_id")))
                    if form.get("managed_asset_id")
                    else None
                ),
            )
    else:
        try:
            body_json = await request.json()
            req = ResumeAssetCreateRequest.model_validate(body_json)
        except Exception as err:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=f"Invalid request body: {err}",
            ) from err

    domain_input = ResumeAssetInput(
        applicant_profile_id=profile_id,
        resume_id=req.resume_id,
        label=req.label,
        source_markdown_path=req.source_markdown_path,
        upload_pdf_path=req.upload_pdf_path,
        preview_html_path=req.preview_html_path,
        managed_asset_id=req.managed_asset_id,
        language=req.language,
        is_default=req.is_default,
    )
    try:
        created = await service.register_resume(profile_id, domain_input)
    except ResumeFileValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except DefaultResumeConflictError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    return ResumeAssetRead.model_validate(created, from_attributes=True)


@router.get(
    "/profiles/{profile_id}/resumes/{resume_id}",
    response_model=ResumeAssetRead,
)
async def get_resume_for_profile(
    profile_id: UUID,
    resume_id: str,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeAssetRead:
    resume = await service.get_resume(profile_id, resume_id)
    if resume is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Resume {resume_id} not found for profile {profile_id}",
        )
    return ResumeAssetRead.model_validate(resume, from_attributes=True)


@router.patch(
    "/profiles/{profile_id}/resumes/{resume_id}",
    response_model=ResumeAssetRead,
)
async def patch_resume_for_profile(
    profile_id: UUID,
    resume_id: str,
    request: ResumeAssetPatchRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeAssetRead:
    try:
        updated = await service.patch_resume(
            profile_id,
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


@router.delete(
    "/profiles/{profile_id}/resumes/{resume_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_resume_for_profile(
    profile_id: UUID,
    resume_id: str,
    expected_version: Annotated[int, Query(...)],
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    try:
        await service.delete_resume(
            profile_id, resume_id, expected_version=expected_version
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


# --- Documents Management ---


@router.get("/profiles/{profile_id}/documents", response_model=DocumentListResponse)
async def list_documents(
    profile_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> DocumentListResponse:
    docs = await service.list_documents(profile_id)
    return DocumentListResponse(
        items=tuple(
            ManagedAssetRead.model_validate(d, from_attributes=True) for d in docs
        )
    )


@router.post(
    "/profiles/{profile_id}/documents",
    response_model=ManagedAssetRead,
    status_code=status.HTTP_201_CREATED,
)
async def upload_document(
    profile_id: UUID,
    file: UploadFile,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    managed_assets: Annotated[ManagedAssetService, Depends(get_managed_asset_service)],
) -> ManagedAssetRead:
    async def file_stream() -> AsyncIterator[bytes]:
        while chunk := await file.read(65536):
            yield chunk

    try:
        asset = await managed_assets.store_asset_stream(
            profile_id=profile_id,
            asset_type=ManagedAssetType.DOCUMENT,
            filename=file.filename or "document.pdf",
            content_stream=file_stream(),
            declared_content_type=file.content_type,
        )
        created = await service._repo.create_managed_asset(asset)
        return ManagedAssetRead.model_validate(created, from_attributes=True)
    except OversizeAssetError as err:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(err),
        ) from err
    except InvalidAssetError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err


@router.delete(
    "/profiles/{profile_id}/documents/{asset_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_document(
    profile_id: UUID,
    asset_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    try:
        await service.delete_document(profile_id, asset_id)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err


# --- Avatar Management ---


@router.get("/profiles/{profile_id}/avatar", response_model=AvatarResponse)
async def get_avatar(
    profile_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> AvatarResponse:
    try:
        asset = await service.get_avatar(profile_id)
        if asset is None:
            return AvatarResponse(asset=None)
        return AvatarResponse(
            asset=ManagedAssetRead.model_validate(asset, from_attributes=True)
        )
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err


@router.post("/profiles/{profile_id}/avatar", response_model=AvatarResponse)
async def upload_avatar(
    profile_id: UUID,
    file: UploadFile,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    managed_assets: Annotated[ManagedAssetService, Depends(get_managed_asset_service)],
    crop_x: Annotated[float | None, Form()] = None,
    crop_y: Annotated[float | None, Form()] = None,
    crop_width: Annotated[float | None, Form()] = None,
    crop_height: Annotated[float | None, Form()] = None,
) -> AvatarResponse:
    prof = await service.get_profile(profile_id)
    if prof is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Applicant profile {profile_id} not found",
        )

    crop = None
    if (
        crop_x is not None
        and crop_y is not None
        and crop_width is not None
        and crop_height is not None
    ):
        crop = AvatarCrop(
            x=crop_x,
            y=crop_y,
            width=crop_width,
            height=crop_height,
        )

    async def file_stream() -> AsyncIterator[bytes]:
        while chunk := await file.read(65536):
            yield chunk

    try:
        asset = await managed_assets.store_asset_stream(
            profile_id=profile_id,
            asset_type=ManagedAssetType.AVATAR,
            filename=file.filename or "avatar.png",
            content_stream=file_stream(),
            declared_content_type=file.content_type,
            crop_coordinates=crop,
        )
        created_asset = await service._repo.create_managed_asset(asset)
        # Update profile avatar_asset_id
        prof_input = ApplicantProfileInput(
            display_name=prof.display_name,
            avatar_asset_id=created_asset.id,
            onboarding_step=prof.onboarding_step,
            onboarding_completed_at=prof.onboarding_completed_at,
            automation_preferences=prof.automation_preferences,
            **{name: getattr(prof, name) for name in _PROFILE_FIELD_NAMES},
        )
        await service.update_profile(profile_id, prof_input, prof.version)
        return AvatarResponse(
            asset=ManagedAssetRead.model_validate(created_asset, from_attributes=True)
        )
    except OversizeAssetError as err:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=str(err),
        ) from err
    except InvalidAssetError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err


@router.post("/profiles/{profile_id}/avatar/crop", response_model=AvatarResponse)
async def update_avatar_crop(
    profile_id: UUID,
    request: AvatarCropRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> AvatarResponse:
    try:
        crop = AvatarCrop(
            x=request.x,
            y=request.y,
            width=request.width,
            height=request.height,
        )
        asset = await service.crop_avatar(profile_id, crop)
        return AvatarResponse(
            asset=ManagedAssetRead.model_validate(asset, from_attributes=True)
        )
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err


@router.delete("/profiles/{profile_id}/avatar", status_code=status.HTTP_204_NO_CONTENT)
async def clear_avatar(
    profile_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    try:
        await service.clear_avatar(profile_id)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err


# --- Asset Binary Content Streaming (Range Reads) ---


@router.get("/profiles/{profile_id}/assets/{asset_id}/content")
async def stream_asset_content(
    profile_id: UUID,
    asset_id: UUID,
    request: Request,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    managed_assets: Annotated[ManagedAssetService, Depends(get_managed_asset_service)],
    if_none_match: Annotated[str | None, Header()] = None,
) -> Response:
    asset = await service._repo.get_managed_asset(profile_id, asset_id)
    if asset is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Asset {asset_id} not found for profile {profile_id}",
        )

    etag = f'"{asset.sha256}"'
    if if_none_match and if_none_match == etag:
        return RawResponse(status_code=status.HTTP_304_NOT_MODIFIED)

    try:
        file_path, file_size = managed_assets.get_asset_file(asset.relative_path)
    except AssetNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except InvalidAssetError as err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(err),
        ) from err

    headers = {
        "Accept-Ranges": "bytes",
        "ETag": etag,
        "Content-Disposition": f'inline; filename="{asset.file_name}"',
    }

    range_header = request.headers.get("range")
    if range_header and range_header.startswith("bytes="):
        # Range request parsing
        range_spec = range_header.removeprefix("bytes=").strip()
        try:
            parts = range_spec.split("-", 1)
            start = int(parts[0]) if parts[0] else 0
            end = int(parts[1]) if parts[1] else file_size - 1
            if start >= file_size or end >= file_size or start > end:
                raise ValueError("Range not satisfiable")
        except ValueError:
            return RawResponse(
                status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE,
                headers={"Content-Range": f"bytes */{file_size}"},
            )

        content_length = end - start + 1
        headers["Content-Range"] = f"bytes {start}-{end}/{file_size}"
        headers["Content-Length"] = str(content_length)

        async def range_stream() -> AsyncIterator[bytes]:
            with open(file_path, "rb") as f:  # noqa: ASYNC230
                f.seek(start)
                remaining = content_length
                while remaining > 0:
                    read_size = min(65536, remaining)
                    chunk = f.read(read_size)
                    if not chunk:
                        break
                    remaining -= len(chunk)
                    yield chunk

        return StreamingResponse(
            range_stream(),
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            media_type=asset.content_type,
            headers=headers,
        )

    headers["Content-Length"] = str(file_size)

    async def full_stream() -> AsyncIterator[bytes]:
        with open(file_path, "rb") as f:  # noqa: ASYNC230
            while chunk := f.read(65536):
                yield chunk

    return StreamingResponse(
        full_stream(),
        status_code=status.HTTP_200_OK,
        media_type=asset.content_type,
        headers=headers,
    )


# --- Answer Bank Management ---


@router.get("/profiles/{profile_id}/answer-bank", response_model=AnswerBankListResponse)
async def list_answers_for_profile(
    profile_id: UUID,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    question_intent: QuestionIntent | None = None,
    jurisdiction: str | None = None,
    platform_scope: str | None = None,
) -> AnswerBankListResponse:
    try:
        answers = await service.list_answers(
            profile_id,
            question_intent=question_intent,
            jurisdiction=jurisdiction,
            platform_scope=platform_scope,
        )
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    return AnswerBankListResponse(
        items=tuple(
            ReusableAnswerRead.model_validate(a, from_attributes=True) for a in answers
        )
    )


@router.post(
    "/profiles/{profile_id}/answer-bank",
    response_model=ReusableAnswerRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_answer_for_profile(
    profile_id: UUID,
    request: ReusableAnswerCreateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    domain_input = ReusableAnswerInput(
        applicant_profile_id=profile_id,
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
        created = await service.create_answer(profile_id, domain_input)
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    return ReusableAnswerRead.model_validate(created, from_attributes=True)


@router.get(
    "/profiles/{profile_id}/answer-bank/{answer_id}",
    response_model=ReusableAnswerRead,
)
async def get_answer_for_profile(
    profile_id: UUID,
    answer_id: str,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    answer = await service.get_answer(profile_id, answer_id)
    if answer is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Answer {answer_id} not found for profile {profile_id}",
        )
    return ReusableAnswerRead.model_validate(answer, from_attributes=True)


@router.put(
    "/profiles/{profile_id}/answer-bank/{answer_id}",
    response_model=ReusableAnswerRead,
)
async def update_answer_for_profile(
    profile_id: UUID,
    answer_id: str,
    request: ReusableAnswerUpdateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    domain_input = ReusableAnswerInput(
        applicant_profile_id=profile_id,
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
            profile_id,
            answer_id,
            domain_input,
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
    except ValueError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err

    return ReusableAnswerRead.model_validate(updated, from_attributes=True)


@router.delete(
    "/profiles/{profile_id}/answer-bank/{answer_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
async def delete_answer_for_profile(
    profile_id: UUID,
    answer_id: str,
    expected_version: Annotated[int, Query(...)],
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    try:
        await service.delete_answer(
            profile_id, answer_id, expected_version=expected_version
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


# --- Backward Compatibility Singular Routes (Operating on Active Profile) ---


@router.get("/applicant-profile", response_model=ApplicantProfileRead)
async def get_legacy_applicant_profile(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    return await get_active_profile(service)


@router.put("/applicant-profile", response_model=ApplicantProfileRead)
async def upsert_legacy_applicant_profile(
    request: ApplicantProfileUpsertRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ApplicantProfileRead:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        if request.expected_version is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Expected version {request.expected_version} "
                    "but profile does not exist"
                ),
            )
        profile_input = _build_profile_input(request)
        created = await service.create_profile(profile_input)
        return ApplicantProfileRead.model_validate(created, from_attributes=True)

    existing = await service.get_profile(active_id)
    if existing is None:
        if request.expected_version is not None:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Expected version {request.expected_version} "
                    "but profile does not exist"
                ),
            )
        profile_input = _build_profile_input(request)
        created = await service.create_profile(profile_input)
        return ApplicantProfileRead.model_validate(created, from_attributes=True)

    expected_version = (
        request.expected_version
        if request.expected_version is not None
        else existing.version
    )
    profile_input = _build_profile_input(request, existing=existing)
    try:
        updated = await service.update_profile(
            active_id, profile_input, expected_version
        )
    except OptimisticLockError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err
    return ApplicantProfileRead.model_validate(updated, from_attributes=True)


@router.post(
    "/applicant-profile/import-resume",
    response_model=ResumeImportProposalResponse,
)
async def import_legacy_resume_preview(
    request: ResumeImportRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeImportProposalResponse:
    active_id = await service.get_active_profile_id()
    try:
        proposal = await service.import_resume_preview(
            active_id, request.source_markdown_path
        )
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
async def list_legacy_resumes(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeListResponse:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        return ResumeListResponse(items=())
    return await list_resumes_for_profile(active_id, service)


@router.post(
    "/resumes",
    response_model=ResumeAssetRead,
    status_code=status.HTTP_201_CREATED,
)
async def register_legacy_resume(
    request: ResumeAssetCreateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeAssetRead:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        prof = await service.create_profile(
            ApplicantProfileInput(display_name="Default Applicant")
        )
        active_id = prof.id

    domain_input = ResumeAssetInput(
        applicant_profile_id=active_id,
        resume_id=request.resume_id,
        label=request.label,
        source_markdown_path=request.source_markdown_path,
        upload_pdf_path=request.upload_pdf_path,
        preview_html_path=request.preview_html_path,
        managed_asset_id=request.managed_asset_id,
        language=request.language,
        is_default=request.is_default,
    )
    try:
        created = await service.register_resume(active_id, domain_input)
    except ResumeFileValidationError as err:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(err),
        ) from err
    except ResourceNotFoundError as err:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=str(err),
        ) from err
    except DefaultResumeConflictError as err:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=str(err),
        ) from err

    return ResumeAssetRead.model_validate(created, from_attributes=True)


@router.patch("/resumes/{resume_id}", response_model=ResumeAssetRead)
async def patch_legacy_resume(
    resume_id: str,
    request: ResumeAssetPatchRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ResumeAssetRead:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active profile configured",
        )
    return await patch_resume_for_profile(active_id, resume_id, request, service)


@router.delete("/resumes/{resume_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_legacy_resume(
    resume_id: str,
    expected_version: Annotated[int, Query(...)],
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active profile configured",
        )
    await delete_resume_for_profile(active_id, resume_id, expected_version, service)


@router.get("/answer-bank", response_model=AnswerBankListResponse)
async def list_legacy_answers(
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
    question_intent: QuestionIntent | None = None,
    jurisdiction: str | None = None,
    platform_scope: str | None = None,
) -> AnswerBankListResponse:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        return AnswerBankListResponse(items=())
    return await list_answers_for_profile(
        active_id, service, question_intent, jurisdiction, platform_scope
    )


@router.post(
    "/answer-bank",
    response_model=ReusableAnswerRead,
    status_code=status.HTTP_201_CREATED,
)
async def create_legacy_answer(
    request: ReusableAnswerCreateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        prof = await service.create_profile(
            ApplicantProfileInput(display_name="Default Applicant")
        )
        active_id = prof.id
    return await create_answer_for_profile(active_id, request, service)


@router.put("/answer-bank/{answer_id}", response_model=ReusableAnswerRead)
async def update_legacy_answer(
    answer_id: str,
    request: ReusableAnswerUpdateRequest,
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> ReusableAnswerRead:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active profile configured",
        )
    return await update_answer_for_profile(active_id, answer_id, request, service)


@router.delete("/answer-bank/{answer_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_legacy_answer(
    answer_id: str,
    expected_version: Annotated[int, Query(...)],
    service: Annotated[ApplicantService, Depends(get_applicant_service)],
) -> None:
    active_id = await service.get_active_profile_id()
    if active_id is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No active profile configured",
        )
    await delete_answer_for_profile(active_id, answer_id, expected_version, service)
