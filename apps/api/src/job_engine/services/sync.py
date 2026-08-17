from __future__ import annotations

import asyncio
from collections.abc import AsyncGenerator, Mapping, Sequence
from datetime import UTC, datetime
from uuid import UUID

from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from job_engine.api.schemas import (
    SyncCompletedEvent,
    SyncErrorSummary,
    SyncSourceCompletedEvent,
    SyncSourceProgressEvent,
    SyncSourceStatus,
    SyncStage,
    SyncStartedEvent,
)
from job_engine.config import Settings
from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import IngestionRunStatus, JobStatus
from job_engine.domain.jobs import (
    ErrorSummary,
    IngestionRunCompletion,
)
from job_engine.services.deduplication import apply_to_catalog
from job_engine.services.ingestion import (
    _error_summary,
    _mark_stale_absences,
    _recompute_groups,
    _run_status,
)
from job_engine.services.normalization import normalize_candidate
from job_engine.sources.base import (
    AdapterError,
    RecordValidationError,
    SourceAdapter,
    redact_text,
)
from job_engine.sources.registry import get_adapter

DEFAULT_COOLDOWN_SECONDS = 30.0


class LiveSyncCooldownError(Exception):
    """Raised when a live sync is requested before the cooldown period has elapsed."""

    def __init__(self, message: str, *, retry_after_seconds: float) -> None:
        super().__init__(message)
        self.retry_after_seconds = retry_after_seconds


class LiveSyncGuard:
    """Thread/coroutine-safe concurrency and cooldown tracker for live sync."""

    def __init__(self, cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS) -> None:
        self.cooldown_seconds = cooldown_seconds
        self._lock = asyncio.Lock()
        self._last_started_at: datetime | None = None
        self._is_running: bool = False

    @property
    def is_running(self) -> bool:
        return self._is_running

    @property
    def last_started_at(self) -> datetime | None:
        return self._last_started_at

    async def acquire(self, cooldown_seconds: float | None = None) -> float | None:
        """Attempt to acquire permission to run a live sync.

        Returns None if acquired successfully.
        Returns a float with remaining cooldown seconds if locked or in cooldown.
        """
        cooldown = (
            cooldown_seconds if cooldown_seconds is not None else self.cooldown_seconds
        )
        now = datetime.now(UTC)
        async with self._lock:
            if self._is_running:
                if self._last_started_at is not None:
                    elapsed = (now - self._last_started_at).total_seconds()
                    remaining = max(1.0, cooldown - elapsed)
                else:
                    remaining = cooldown
                return remaining

            if self._last_started_at is not None:
                elapsed = (now - self._last_started_at).total_seconds()
                if elapsed < cooldown:
                    return max(0.1, cooldown - elapsed)

            self._is_running = True
            self._last_started_at = now
            return None

    async def release(self) -> None:
        """Release the active running flag."""
        async with self._lock:
            self._is_running = False

    async def reset(self) -> None:
        """Reset state completely (used for testing)."""
        async with self._lock:
            self._is_running = False
            self._last_started_at = None


# Global default guard instance
_GLOBAL_GUARD = LiveSyncGuard()


def get_global_guard() -> LiveSyncGuard:
    return _GLOBAL_GUARD


def format_sse_event(event_name: str, event_data: BaseModel) -> str:
    return f"event: {event_name}\ndata: {event_data.model_dump_json()}\n\n"


def _map_ingestion_status_to_sync_status(
    status: IngestionRunStatus,
) -> SyncSourceStatus:
    if status is IngestionRunStatus.SUCCESS:
        return SyncSourceStatus.SUCCESS
    if status is IngestionRunStatus.PARTIAL_SUCCESS:
        return SyncSourceStatus.PARTIAL_SUCCESS
    return SyncSourceStatus.FAILURE


def _compute_overall_status(
    statuses: Sequence[SyncSourceStatus],
) -> SyncSourceStatus:
    if not statuses:
        return SyncSourceStatus.SUCCESS
    if all(s is SyncSourceStatus.SUCCESS for s in statuses):
        return SyncSourceStatus.SUCCESS
    if all(s is SyncSourceStatus.FAILURE for s in statuses):
        return SyncSourceStatus.FAILURE
    return SyncSourceStatus.PARTIAL_SUCCESS


class LiveSyncService:
    def __init__(
        self,
        session_factory: async_sessionmaker[AsyncSession],
        settings: Settings,
        *,
        guard: LiveSyncGuard | None = None,
        cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS,
    ) -> None:
        self._session_factory = session_factory
        self._settings = settings
        self._guard = guard if guard is not None else get_global_guard()
        self._cooldown_seconds = cooldown_seconds

    async def _ingest_source(
        self,
        source_id: str,
        adapter: SourceAdapter,
        event_queue: asyncio.Queue[str | None],
        *,
        observed_at: datetime,
    ) -> SyncSourceCompletedEvent:
        async with self._session_factory() as session:
            repo = CatalogRepository(session)
            run = await repo.start_ingestion_run(
                source_id, adapter_version=adapter.adapter_version
            )
            fetched = 0
            accepted = 0
            rejected = 0
            inserted = 0
            updated = 0
            marked_closed = 0
            marked_stale = 0
            errors: list[ErrorSummary] = []
            fetch_failed = False
            pages_ok = 0
            affected_groups: set[UUID] = set()
            cursor = None

            while True:
                # Progress: fetching
                await event_queue.put(
                    format_sse_event(
                        "source_progress",
                        SyncSourceProgressEvent(
                            source_id=source_id,
                            stage=SyncStage.FETCHING,
                            fetched_count=fetched,
                            accepted_count=accepted,
                            rejected_count=rejected,
                        ),
                    )
                )

                try:
                    page = await adapter.fetch_page(cursor)
                except AdapterError as exc:
                    fetch_failed = True
                    errors.append(_error_summary(exc))
                    break
                except Exception as exc:
                    fetch_failed = True
                    errors.append(_error_summary(exc, code="fetch_error"))
                    break

                pages_ok += 1
                fetched += page.fetched_count

                # Progress: normalizing
                await event_queue.put(
                    format_sse_event(
                        "source_progress",
                        SyncSourceProgressEvent(
                            source_id=source_id,
                            stage=SyncStage.NORMALIZING,
                            fetched_count=fetched,
                            accepted_count=accepted,
                            rejected_count=rejected,
                        ),
                    )
                )

                for raw in page.raw_records:
                    nested = await session.begin_nested()
                    try:
                        parsed = adapter.parse_record(raw)
                        candidate = adapter.map_candidate(
                            parsed, run_id=run.id, seen_at=observed_at
                        )
                        existing = await repo.get_source_posting(
                            candidate.source_id, candidate.source_posting_id
                        )

                        # Progress: persisting
                        await event_queue.put(
                            format_sse_event(
                                "source_progress",
                                SyncSourceProgressEvent(
                                    source_id=source_id,
                                    stage=SyncStage.PERSISTING,
                                    fetched_count=fetched,
                                    accepted_count=accepted,
                                    rejected_count=rejected,
                                ),
                            )
                        )

                        result = await apply_to_catalog(
                            repo, normalize_candidate(candidate)
                        )
                        accepted += 1
                        if existing is None:
                            inserted += 1
                        else:
                            updated += 1
                        if candidate.status is JobStatus.CLOSED:
                            marked_closed += 1
                        affected_groups.add(result.group.id)
                        await nested.commit()
                    except RecordValidationError as exc:
                        await nested.rollback()
                        rejected += 1
                        errors.append(_error_summary(exc))
                    except Exception as exc:
                        await nested.rollback()
                        rejected += 1
                        errors.append(_error_summary(exc, code="persist_error"))

                cursor = page.next_cursor
                if cursor is None:
                    break

            run_status = _run_status(
                pages_ok=pages_ok, fetch_failed=fetch_failed, rejected=rejected
            )
            if run_status is IngestionRunStatus.SUCCESS:
                stale_count, stale_groups = await _mark_stale_absences(
                    repo,
                    source_id,
                    run_started_at=run.started_at,
                    stale_after_successful_misses=self._settings.stale_after_successful_misses(
                        source_id
                    ),
                )
                marked_stale += stale_count
                affected_groups.update(stale_groups)

            await _recompute_groups(repo, affected_groups, seen_at=observed_at)
            await repo.complete_ingestion_run(
                run.id,
                IngestionRunCompletion(
                    status=run_status,
                    fetched_count=fetched,
                    accepted_count=accepted,
                    rejected_count=rejected,
                    inserted_count=inserted,
                    updated_count=updated,
                    marked_stale_count=marked_stale,
                    marked_closed_count=marked_closed,
                    error_summaries=tuple(errors),
                ),
            )
            await session.commit()

            sync_status = _map_ingestion_status_to_sync_status(run_status)
            completed_event = SyncSourceCompletedEvent(
                source_id=source_id,
                status=sync_status,
                inserted_count=inserted,
                updated_count=updated,
                marked_stale_count=marked_stale,
                error_summaries=tuple(
                    SyncErrorSummary(code=e.code, message=e.message) for e in errors
                ),
            )
            await event_queue.put(format_sse_event("source_completed", completed_event))
            return completed_event

    async def _safe_ingest_source(
        self,
        source_id: str,
        adapter: SourceAdapter,
        event_queue: asyncio.Queue[str | None],
        *,
        observed_at: datetime,
    ) -> SyncSourceCompletedEvent:
        try:
            return await self._ingest_source(
                source_id,
                adapter,
                event_queue,
                observed_at=observed_at,
            )
        except Exception as exc:
            # Fallback isolation for any unforeseen initialization or DB error
            error_summary = SyncErrorSummary(
                code=type(exc).__name__, message=redact_text(str(exc))
            )
            completed_event = SyncSourceCompletedEvent(
                source_id=source_id,
                status=SyncSourceStatus.FAILURE,
                inserted_count=0,
                updated_count=0,
                marked_stale_count=0,
                error_summaries=(error_summary,),
            )
            await event_queue.put(format_sse_event("source_completed", completed_event))
            return completed_event

    @property
    def guard(self) -> LiveSyncGuard:
        return self._guard

    async def stream_live_sync(
        self,
        *,
        adapters: Mapping[str, SourceAdapter] | None = None,
        observed_at: datetime | None = None,
        already_acquired: bool = False,
    ) -> AsyncGenerator[str]:
        # Attempt to acquire the sync lock / cooldown guard if not already acquired
        if not already_acquired:
            remaining = await self._guard.acquire(self._cooldown_seconds)
            if remaining is not None:
                raise LiveSyncCooldownError(
                    f"Live sync cooldown active. Please wait "
                    f"{int(remaining) or 1} seconds.",
                    retry_after_seconds=remaining,
                )

        event_queue: asyncio.Queue[str | None] = asyncio.Queue()
        now = observed_at if observed_at is not None else datetime.now(UTC)
        source_ids = tuple(self._settings.enabled_sources)

        async def _coordinator() -> None:
            try:
                # 1. Emit sync_started
                await event_queue.put(
                    format_sse_event(
                        "sync_started",
                        SyncStartedEvent(sources=source_ids, started_at=now),
                    )
                )

                # 2. Build adapter map
                resolved_adapters: dict[str, SourceAdapter] = {}
                for sid in source_ids:
                    if adapters is not None and sid in adapters:
                        resolved_adapters[sid] = adapters[sid]
                    else:
                        resolved_adapters[sid] = get_adapter(sid, self._settings)

                # 3. Launch concurrent ingestion tasks
                tasks = [
                    asyncio.create_task(
                        self._safe_ingest_source(
                            sid,
                            resolved_adapters[sid],
                            event_queue,
                            observed_at=now,
                        )
                    )
                    for sid in source_ids
                ]

                results: list[
                    SyncSourceCompletedEvent | BaseException
                ] = await asyncio.gather(*tasks, return_exceptions=True)

                # 4. Compute and emit sync_completed
                completed_events: list[SyncSourceCompletedEvent] = []
                for res in results:
                    if isinstance(res, SyncSourceCompletedEvent):
                        completed_events.append(res)
                    else:
                        completed_events.append(
                            SyncSourceCompletedEvent(
                                source_id="unknown",
                                status=SyncSourceStatus.FAILURE,
                                inserted_count=0,
                                updated_count=0,
                                marked_stale_count=0,
                                error_summaries=(
                                    SyncErrorSummary(
                                        code="exception", message=str(res)
                                    ),
                                ),
                            )
                        )

                total_inserted = sum(e.inserted_count for e in completed_events)
                total_updated = sum(e.updated_count for e in completed_events)
                total_stale = sum(e.marked_stale_count for e in completed_events)
                overall_status = _compute_overall_status(
                    [e.status for e in completed_events]
                )

                completed_at = datetime.now(UTC)
                await event_queue.put(
                    format_sse_event(
                        "sync_completed",
                        SyncCompletedEvent(
                            status=overall_status,
                            total_inserted=total_inserted,
                            total_updated=total_updated,
                            total_stale=total_stale,
                            completed_at=completed_at,
                        ),
                    )
                )
            finally:
                await event_queue.put(None)

        coordinator_task = asyncio.create_task(_coordinator())
        try:
            while True:
                item = await event_queue.get()
                if item is None:
                    break
                yield item
        finally:
            if not coordinator_task.done():
                coordinator_task.cancel()
                try:
                    await coordinator_task
                except (asyncio.CancelledError, Exception):
                    pass
            await self._guard.release()
