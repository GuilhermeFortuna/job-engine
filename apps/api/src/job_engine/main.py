import hmac
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from typing import Any, Literal
from urllib.parse import urlsplit

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncEngine

from job_engine.api.applicant import router as applicant_router
from job_engine.api.application_answers import router as application_answers_router
from job_engine.api.applications import (
    application_batches_router,
    application_runs_router,
    runner_router,
)
from job_engine.api.catalog import router as catalog_router
from job_engine.api.jobs import router as jobs_router
from job_engine.api.local_ai import router as local_ai_router
from job_engine.api.sync import router as sync_router
from job_engine.config import Settings
from job_engine.db.session import create_engine, create_session_factory
from job_engine.services.local_inference import (
    LocalInferenceBroker,
    create_local_http_client,
)


class HealthResponse(BaseModel):
    status: Literal["ok"]


def _get_allowed_origins(frontend_origin: str) -> list[str]:
    origins = {frontend_origin.rstrip("/")}
    try:
        parsed = urlsplit(frontend_origin)
        port_suffix = f":{parsed.port}" if parsed.port else ""
        scheme = parsed.scheme or "http"
        if parsed.hostname in {"localhost", "127.0.0.1", "::1", "[::1]"}:
            origins.add(f"{scheme}://localhost{port_suffix}")
            origins.add(f"{scheme}://127.0.0.1{port_suffix}")
            origins.add(f"{scheme}://[::1]{port_suffix}")
    except Exception:
        pass
    return sorted(origins)


@asynccontextmanager
async def _lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    broker = getattr(app.state, "local_inference_broker", None)
    if broker is not None:
        await broker.aclose()
    engine: AsyncEngine = app.state.engine
    await engine.dispose()


def create_app(settings: Settings | None = None) -> FastAPI:
    resolved = Settings() if settings is None else settings
    if len(resolved.runner_secret) < 32:
        raise ValueError(
            "JOB_ENGINE_RUNNER_SECRET must be explicitly configured with at least "
            "32 characters"
        )
    resolved.ensure_data_root()
    resolved.ensure_resume_root()
    engine = create_engine(resolved.database_url)
    app = FastAPI(lifespan=_lifespan, title="Job Engine API")
    app.state.settings = resolved
    app.state.engine = engine
    app.state.session_factory = create_session_factory(engine)

    # Shared local inference client + broker (BACK-015). Always constructed so
    # status/self-test/proposal routes can use the configured loopback endpoint
    # even when answer_provider is deterministic.
    local_client = create_local_http_client(
        timeout_seconds=max(
            resolved.local_inference_extraction_timeout_seconds,
            resolved.local_inference_answer_timeout_seconds,
            60.0,
        )
    )
    local_broker = LocalInferenceBroker(
        client=local_client,
        base_url=resolved.local_provider_base_url,
        concurrency_limit=resolved.local_inference_concurrency,
        queue_limit=resolved.local_inference_queue_limit,
        acquire_timeout_seconds=resolved.local_inference_acquire_timeout_seconds,
    )
    app.state.local_inference_broker = local_broker

    allowed_origins = _get_allowed_origins(resolved.frontend_origin)
    allowed_origins_set = set(allowed_origins)

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.middleware("http")
    async def csrf_origin_check(request: Request, call_next: Any) -> Response:
        if request.method in {"POST", "PUT", "PATCH", "DELETE", "OPTIONS"}:
            sec_fetch_site = request.headers.get("sec-fetch-site")
            origin = request.headers.get("origin")
            authorization = request.headers.get("authorization", "")
            is_runner = authorization.startswith("Bearer ") and hmac.compare_digest(
                authorization.removeprefix("Bearer "), resolved.runner_secret
            )
            if sec_fetch_site == "cross-site" or (
                not is_runner and origin not in allowed_origins_set
            ):
                return JSONResponse(
                    status_code=403,
                    content={
                        "detail": (
                            "Cross-site requests forbidden by CSRF protection policy"
                        )
                    },
                )
        response: Response = await call_next(request)
        return response

    @app.get("/api/v1/health", response_model=HealthResponse)
    async def health() -> HealthResponse:
        return HealthResponse(status="ok")

    app.include_router(jobs_router, prefix="/api/v1")
    app.include_router(catalog_router, prefix="/api/v1")
    app.include_router(sync_router, prefix="/api/v1")
    app.include_router(applicant_router, prefix="/api/v1")
    app.include_router(application_batches_router, prefix="/api/v1")
    app.include_router(application_runs_router, prefix="/api/v1")
    app.include_router(runner_router, prefix="/api/v1")
    app.include_router(application_answers_router, prefix="/api/v1")
    app.include_router(local_ai_router, prefix="/api/v1")
    return app
