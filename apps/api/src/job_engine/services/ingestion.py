from __future__ import annotations

from collections.abc import Sequence
from datetime import datetime
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.config import Settings
from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import IngestionRunStatus, JobStatus
from job_engine.domain.jobs import (
    ErrorSummary,
    IngestionRun,
    IngestionRunCompletion,
    SourcePosting,
)
from job_engine.services.deduplication import apply_to_catalog
from job_engine.services.normalization import normalize_candidate
from job_engine.sources.base import (
    AdapterError,
    RecordValidationError,
    SourceAdapter,
    redact_text,
)
from job_engine.sources.registry import get_adapter

STATUS_PRECEDENCE = (
    JobStatus.ACTIVE,
    JobStatus.UNKNOWN,
    JobStatus.STALE,
    JobStatus.CLOSED,
)


def resolve_group_lifecycle(
    postings: Sequence[SourcePosting],
    *,
    seen_at: datetime,
) -> tuple[JobStatus, datetime | None]:
    if not postings:
        return JobStatus.UNKNOWN, None
    present = {posting.status for posting in postings}
    status = JobStatus.UNKNOWN
    for candidate in STATUS_PRECEDENCE:
        if candidate in present:
            status = candidate
            break
    if status is JobStatus.CLOSED:
        closed_times = [
            item.closed_at for item in postings if item.closed_at is not None
        ]
        closed_at = max(closed_times) if closed_times else seen_at
        return status, closed_at
    return status, None


def _error_summary(exc: BaseException, *, code: str | None = None) -> ErrorSummary:
    return ErrorSummary(
        code=code or type(exc).__name__,
        message=redact_text(str(exc)),
    )


def _run_status(
    *, pages_ok: int, fetch_failed: bool, rejected: int
) -> IngestionRunStatus:
    if pages_ok == 0:
        return IngestionRunStatus.FAILURE
    if fetch_failed or rejected > 0:
        return IngestionRunStatus.PARTIAL_SUCCESS
    return IngestionRunStatus.SUCCESS


async def _recompute_groups(
    repo: CatalogRepository,
    group_ids: set[UUID],
    *,
    seen_at: datetime,
) -> None:
    for group_id in group_ids:
        group = await repo.get_job_group(group_id)
        if group is None:
            continue
        status, closed_at = resolve_group_lifecycle(
            group.source_postings, seen_at=seen_at
        )
        if group.status is status and group.closed_at == closed_at:
            continue
        await repo.update_job_group_lifecycle(group_id, status, closed_at=closed_at)


async def _mark_stale_absences(
    repo: CatalogRepository,
    source_id: str,
    *,
    run_started_at: datetime,
) -> tuple[int, set[UUID]]:
    previous = await repo.list_successful_ingestion_runs(
        source_id, before=run_started_at, limit=1
    )
    if not previous:
        return 0, set()
    cutoff = previous[0].started_at
    marked = 0
    groups: set[UUID] = set()
    for posting in await repo.list_source_postings(source_id):
        if posting.status in {JobStatus.CLOSED, JobStatus.STALE}:
            continue
        if posting.last_seen_at >= cutoff:
            continue
        await repo.update_source_posting_status(
            posting.source_id, posting.source_posting_id, JobStatus.STALE
        )
        marked += 1
        group = await repo.get_job_group_by_source_posting(
            posting.source_id, posting.source_posting_id
        )
        if group is not None:
            groups.add(group.id)
    return marked, groups


async def run_ingestion(
    session: AsyncSession,
    source_id: str,
    settings: Settings,
    *,
    adapter: SourceAdapter | None = None,
    seen_at: datetime | None = None,
) -> IngestionRun:
    repo = CatalogRepository(session)
    resolved = adapter if adapter is not None else get_adapter(source_id, settings)
    run = await repo.start_ingestion_run(
        source_id, adapter_version=resolved.adapter_version
    )
    observed_at = seen_at if seen_at is not None else run.started_at
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
        try:
            page = await resolved.fetch_page(cursor)
        except AdapterError as exc:
            fetch_failed = True
            errors.append(_error_summary(exc))
            break
        pages_ok += 1
        fetched += page.fetched_count
        for raw in page.raw_records:
            nested = await session.begin_nested()
            try:
                parsed = resolved.parse_record(raw)
                candidate = resolved.map_candidate(
                    parsed, run_id=run.id, seen_at=observed_at
                )
                existing = await repo.get_source_posting(
                    candidate.source_id, candidate.source_posting_id
                )
                result = await apply_to_catalog(repo, normalize_candidate(candidate))
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

    status = _run_status(
        pages_ok=pages_ok, fetch_failed=fetch_failed, rejected=rejected
    )
    if status is IngestionRunStatus.SUCCESS:
        stale_count, stale_groups = await _mark_stale_absences(
            repo, source_id, run_started_at=run.started_at
        )
        marked_stale += stale_count
        affected_groups.update(stale_groups)
    await _recompute_groups(repo, affected_groups, seen_at=observed_at)
    return await repo.complete_ingestion_run(
        run.id,
        IngestionRunCompletion(
            status=status,
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
