from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import StreamingResponse

from job_engine.api.dependencies import get_settings
from job_engine.config import Settings
from job_engine.services.sync import LiveSyncService

router = APIRouter(prefix="/catalog")


async def _handle_live_sync(
    request: Request,
    settings: Settings,
) -> StreamingResponse:
    session_factory = request.app.state.session_factory
    service = LiveSyncService(session_factory, settings)
    remaining = await service.guard.acquire()
    if remaining is not None:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Live sync cooldown active. Please wait "
                f"{max(1, int(remaining))} seconds before syncing again."
            ),
            headers={"Retry-After": str(max(1, int(remaining)))},
        )

    generator = service.stream_live_sync(already_acquired=True)
    return StreamingResponse(
        generator,
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/live-sync")
async def post_live_sync(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    return await _handle_live_sync(request, settings)


@router.get("/live-sync")
async def get_live_sync(
    request: Request,
    settings: Annotated[Settings, Depends(get_settings)],
) -> StreamingResponse:
    return await _handle_live_sync(request, settings)
