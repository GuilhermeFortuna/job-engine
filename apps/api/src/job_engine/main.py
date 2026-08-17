from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Literal

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncEngine

from job_engine.api.catalog import router as catalog_router
from job_engine.api.jobs import router as jobs_router
from job_engine.api.sync import router as sync_router
from job_engine.config import Settings
from job_engine.db.session import create_engine, create_session_factory


class HealthResponse(BaseModel):
    status: Literal["ok"]


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    engine: AsyncEngine = app.state.engine
    await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = Settings() if settings is None else settings
    engine = create_engine(resolved.database_url)
    app = FastAPI(lifespan=_lifespan, title="Job Engine API")
    app.state.settings = resolved
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/api/v1/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(catalog_router, prefix="/api/v1")
    app.include_router(sync_router, prefix="/api/v1")
    return app
