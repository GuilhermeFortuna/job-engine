from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.api.dependencies import get_session, get_settings
from job_engine.api.schemas import JobDetail, JobSearchQuery, JobSearchResponse
from job_engine.config import Settings
from job_engine.services.search import SearchService

router = APIRouter()


@router.get("/jobs", response_model=JobSearchResponse)
async def search_jobs(
    params: Annotated[JobSearchQuery, Query()],
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> JobSearchResponse:
    return await SearchService(session, settings).search(params)


@router.get("/jobs/{job_group_id}", response_model=JobDetail)
async def get_job(
    job_group_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> JobDetail:
    detail = await SearchService(session, settings).get_details(job_group_id)
    if detail is None:
        raise HTTPException(status_code=404, detail="Job group not found")
    return detail
