from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.api.dependencies import get_session, get_settings
from job_engine.api.schemas import CatalogFilters, CatalogHealth
from job_engine.config import Settings
from job_engine.services.search import SearchService

router = APIRouter(prefix="/catalog")


@router.get("/filters", response_model=CatalogFilters)
async def catalog_filters(
    settings: Annotated[Settings, Depends(get_settings)],
) -> CatalogFilters:
    return SearchService(None, settings).filters()


@router.get("/health", response_model=CatalogHealth)
async def catalog_health(
    session: Annotated[AsyncSession, Depends(get_session)],
    settings: Annotated[Settings, Depends(get_settings)],
) -> CatalogHealth:
    return await SearchService(session, settings).health()
