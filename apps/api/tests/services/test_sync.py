from __future__ import annotations

import json
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from sqlalchemy import func, select

from job_engine.config import Settings
from job_engine.db.models import JobGroup as JobGroupRow
from job_engine.db.models import SourcePosting as SourcePostingRow
from job_engine.db.session import create_engine, create_session_factory
from job_engine.domain.enums import JobStatus
from job_engine.services.normalization import NormalizationCandidate
from job_engine.services.sync import (
    LiveSyncCooldownError,
    LiveSyncGuard,
    LiveSyncService,
)
from job_engine.sources.base import (
    LifecycleSignal,
    PageCursor,
    RateLimitError,
    SourceAdapter,
    SourcePage,
    TransportError,
)
from tests.db.conftest import alembic_config

AGGREGATOR_SOURCES = ("himalayas", "jobicy", "remoteok")
SEEN_AT = datetime(2026, 8, 17, 12, 0, tzinfo=UTC)


class FakeSourceAdapter:
    def __init__(
        self,
        source_id: str,
        records: list[dict[str, Any]],
        *,
        fail_with: Exception | None = None,
        adapter_version: str = "1.0.0",
    ) -> None:
        self.source_id = source_id
        self.adapter_version = adapter_version
        self._records = records
        self._fail_with = fail_with

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        if self._fail_with is not None:
            raise self._fail_with
        return SourcePage(
            raw_records=tuple(self._records),
            next_cursor=None,
            fetched_count=len(self._records),
        )

    def parse_record(self, raw: object) -> Mapping[str, Any]:
        assert isinstance(raw, dict)
        return raw

    def map_candidate(
        self,
        parsed: Mapping[str, Any],
        *,
        run_id: object,
        seen_at: datetime,
    ) -> NormalizationCandidate:
        posting_id = str(parsed["id"])
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=posting_id,
            source_name=self.source_id.title(),
            listing_url=f"https://{self.source_id}.example/jobs/{posting_id}",
            title_original=str(parsed["title"]),
            company_original=str(parsed["company"]),
            description="Build scalable software.",
            location_original="Brazil",
            remote_evidence="remote",
            employment_type_evidence="full-time",
            seniority_evidence="senior",
            technologies_original_text="Python",
            location_eligibility_evidence="Remote in Brazil",
            published_at=seen_at,
            source_timestamp=seen_at,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
            status=JobStatus.ACTIVE,
            ingestion_run_id=run_id if isinstance(run_id, UUID) else None,
            adapter_version=self.adapter_version,
        )

    def lifecycle_signal(
        self, parsed: Mapping[str, Any], *, seen_at: datetime
    ) -> LifecycleSignal:
        return LifecycleSignal(last_seen_at=seen_at, status=JobStatus.ACTIVE)


def _parse_sse_events(chunks: list[str]) -> list[tuple[str, dict[str, Any]]]:
    text = "".join(chunks)
    events: list[tuple[str, dict[str, Any]]] = []
    blocks = text.strip().split("\n\n")
    for block in blocks:
        lines = [line.strip() for line in block.split("\n") if line.strip()]
        event_type = None
        data_json = None
        for line in lines:
            if line.startswith("event:"):
                event_type = line[len("event:") :].strip()
            elif line.startswith("data:"):
                data_json = json.loads(line[len("data:") :].strip())
        if event_type and data_json is not None:
            events.append((event_type, data_json))
    return events


@pytest.mark.asyncio
async def test_live_sync_success_all_sources(disposable_database_url: str) -> None:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine_helper(disposable_database_url)
    factory = create_session_factory(engine)
    settings = Settings(
        database_url=disposable_database_url,
        enabled_sources=("himalayas", "jobicy", "remoteok"),
    )
    guard = LiveSyncGuard(cooldown_seconds=1.0)
    service = LiveSyncService(factory, settings, guard=guard)

    adapters: dict[str, SourceAdapter] = {
        "himalayas": FakeSourceAdapter(
            "himalayas", [{"id": "him-1", "title": "Backend Dev", "company": "Acme"}]
        ),
        "jobicy": FakeSourceAdapter(
            "jobicy", [{"id": "job-1", "title": "Full Stack Dev", "company": "Beta"}]
        ),
        "remoteok": FakeSourceAdapter(
            "remoteok", [{"id": "rem-1", "title": "Python Dev", "company": "Gamma"}]
        ),
    }

    chunks: list[str] = []
    async for chunk in service.stream_live_sync(adapters=adapters, observed_at=SEEN_AT):
        chunks.append(chunk)

    events = _parse_sse_events(chunks)
    event_types = [e[0] for e in events]
    assert "sync_started" in event_types
    assert "source_progress" in event_types
    assert "source_completed" in event_types
    assert "sync_completed" in event_types

    # Validate sync_started
    started_event = next(e[1] for e in events if e[0] == "sync_started")
    assert set(started_event["sources"]) == {"himalayas", "jobicy", "remoteok"}

    # Validate source_completed events
    completed_sources = [e[1] for e in events if e[0] == "source_completed"]
    assert len(completed_sources) == 3
    for sc in completed_sources:
        assert sc["status"] == "success"
        assert sc["inserted_count"] == 1
        assert sc["error_summaries"] == []

    # Validate sync_completed
    completed_event = next(e[1] for e in events if e[0] == "sync_completed")
    assert completed_event["status"] == "success"
    assert completed_event["total_inserted"] == 3
    assert completed_event["total_updated"] == 0

    # Validate DB state
    async with factory() as session:
        posting_count = await session.scalar(
            select(func.count()).select_from(SourcePostingRow)
        )
        group_count = await session.scalar(
            select(func.count()).select_from(JobGroupRow)
        )
        assert posting_count == 3
        assert group_count == 3

    await engine.dispose()


@pytest.mark.asyncio
async def test_live_sync_partial_source_failure(
    disposable_database_url: str,
) -> None:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine_helper(disposable_database_url)
    factory = create_session_factory(engine)
    settings = Settings(
        database_url=disposable_database_url,
        enabled_sources=("himalayas", "jobicy", "remoteok"),
    )
    guard = LiveSyncGuard(cooldown_seconds=1.0)
    service = LiveSyncService(factory, settings, guard=guard)

    adapters: dict[str, SourceAdapter] = {
        "himalayas": FakeSourceAdapter(
            "himalayas",
            [{"id": "him-1", "title": "Dev", "company": "Acme"}],
            fail_with=RateLimitError("Rate limit exceeded 429"),
        ),
        "jobicy": FakeSourceAdapter(
            "jobicy", [{"id": "job-1", "title": "Dev", "company": "Beta"}]
        ),
        "remoteok": FakeSourceAdapter(
            "remoteok", [{"id": "rem-1", "title": "Dev", "company": "Gamma"}]
        ),
    }

    chunks: list[str] = []
    async for chunk in service.stream_live_sync(adapters=adapters, observed_at=SEEN_AT):
        chunks.append(chunk)

    events = _parse_sse_events(chunks)
    completed_sources = {
        e[1]["source_id"]: e[1] for e in events if e[0] == "source_completed"
    }
    assert completed_sources["himalayas"]["status"] == "failure"
    assert len(completed_sources["himalayas"]["error_summaries"]) > 0
    assert completed_sources["jobicy"]["status"] == "success"
    assert completed_sources["remoteok"]["status"] == "success"

    completed_event = next(e[1] for e in events if e[0] == "sync_completed")
    assert completed_event["status"] == "partial_success"
    assert completed_event["total_inserted"] == 2

    await engine.dispose()


@pytest.mark.asyncio
async def test_live_sync_all_sources_failure(disposable_database_url: str) -> None:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine_helper(disposable_database_url)
    factory = create_session_factory(engine)
    settings = Settings(
        database_url=disposable_database_url,
        enabled_sources=("himalayas", "jobicy", "remoteok"),
    )
    guard = LiveSyncGuard(cooldown_seconds=1.0)
    service = LiveSyncService(factory, settings, guard=guard)

    adapters: dict[str, SourceAdapter] = {
        "himalayas": FakeSourceAdapter(
            "himalayas", [], fail_with=TransportError("Connection timed out")
        ),
        "jobicy": FakeSourceAdapter(
            "jobicy", [], fail_with=TransportError("Network unreachable")
        ),
        "remoteok": FakeSourceAdapter(
            "remoteok", [], fail_with=TransportError("Service unavailable")
        ),
    }

    chunks: list[str] = []
    async for chunk in service.stream_live_sync(adapters=adapters, observed_at=SEEN_AT):
        chunks.append(chunk)

    events = _parse_sse_events(chunks)
    completed_event = next(e[1] for e in events if e[0] == "sync_completed")
    assert completed_event["status"] == "failure"
    assert completed_event["total_inserted"] == 0

    await engine.dispose()


@pytest.mark.asyncio
async def test_live_sync_cooldown_guard(disposable_database_url: str) -> None:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine_helper(disposable_database_url)
    factory = create_session_factory(engine)
    settings = Settings(
        database_url=disposable_database_url,
        enabled_sources=("himalayas", "jobicy", "remoteok"),
    )
    guard = LiveSyncGuard(cooldown_seconds=30.0)
    service = LiveSyncService(factory, settings, guard=guard)

    adapters: dict[str, SourceAdapter] = {
        "himalayas": FakeSourceAdapter("himalayas", []),
        "jobicy": FakeSourceAdapter("jobicy", []),
        "remoteok": FakeSourceAdapter("remoteok", []),
    }

    # First run succeeds
    async for _ in service.stream_live_sync(adapters=adapters, observed_at=SEEN_AT):
        pass

    # Immediate second run triggers LiveSyncCooldownError
    with pytest.raises(LiveSyncCooldownError) as exc_info:
        async for _ in service.stream_live_sync(adapters=adapters):
            pass

    assert exc_info.value.retry_after_seconds > 0

    await engine.dispose()


@pytest.mark.asyncio
async def test_live_sync_cancellation_releases_guard(
    disposable_database_url: str,
) -> None:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine_helper(disposable_database_url)
    factory = create_session_factory(engine)
    settings = Settings(
        database_url=disposable_database_url,
        enabled_sources=("himalayas", "jobicy", "remoteok"),
    )
    guard = LiveSyncGuard(cooldown_seconds=1.0)
    service = LiveSyncService(factory, settings, guard=guard)

    adapters: dict[str, SourceAdapter] = {
        "himalayas": FakeSourceAdapter(
            "himalayas", [{"id": "1", "title": "T", "company": "C"}]
        ),
        "jobicy": FakeSourceAdapter(
            "jobicy", [{"id": "2", "title": "T", "company": "C"}]
        ),
        "remoteok": FakeSourceAdapter(
            "remoteok", [{"id": "3", "title": "T", "company": "C"}]
        ),
    }

    gen = service.stream_live_sync(adapters=adapters, observed_at=SEEN_AT)
    # Read first chunk then close
    await anext(gen)
    await gen.aclose()

    assert not guard.is_running
    await engine.dispose()


@pytest.mark.asyncio
async def test_live_sync_deduplication_across_sources(
    disposable_database_url: str,
) -> None:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine_helper(disposable_database_url)
    factory = create_session_factory(engine)
    settings = Settings(
        database_url=disposable_database_url,
        enabled_sources=("himalayas", "jobicy", "remoteok"),
    )
    guard = LiveSyncGuard(cooldown_seconds=1.0)
    service = LiveSyncService(factory, settings, guard=guard)

    # Himalayas and Remote OK share the same canonical URL & company/title
    class DuplicateAdapter(FakeSourceAdapter):
        def map_candidate(
            self,
            parsed: Mapping[str, Any],
            *,
            run_id: object,
            seen_at: datetime,
        ) -> NormalizationCandidate:
            posting_id = str(parsed["id"])
            return NormalizationCandidate(
                source_id=self.source_id,
                source_posting_id=posting_id,
                source_name=self.source_id.title(),
                listing_url="https://company.example/jobs/123",
                title_original="Staff Python Engineer",
                company_original="GlobalCorp",
                description="Build scalable software.",
                location_original="Brazil",
                remote_evidence="remote",
                employment_type_evidence="full-time",
                seniority_evidence="senior",
                technologies_original_text="Python",
                location_eligibility_evidence="Remote in Brazil",
                published_at=seen_at,
                source_timestamp=seen_at,
                first_seen_at=seen_at,
                last_seen_at=seen_at,
                status=JobStatus.ACTIVE,
                ingestion_run_id=run_id if isinstance(run_id, UUID) else None,
                adapter_version=self.adapter_version,
            )

    # Run initial sync with Himalayas
    initial_adapters: dict[str, SourceAdapter] = {
        "himalayas": DuplicateAdapter(
            "himalayas",
            [
                {
                    "id": "him-shared",
                    "title": "Staff Python Engineer",
                    "company": "GlobalCorp",
                }
            ],
        ),
        "jobicy": FakeSourceAdapter("jobicy", []),
        "remoteok": FakeSourceAdapter("remoteok", []),
    }

    async for _ in service.stream_live_sync(
        adapters=initial_adapters, observed_at=SEEN_AT
    ):
        pass

    # Reset guard cooldown for next live sync pass
    await guard.reset()

    # Second sync pass with Remote OK (matching GlobalCorp) and Jobicy (unique)
    second_adapters: dict[str, SourceAdapter] = {
        "himalayas": FakeSourceAdapter("himalayas", []),
        "jobicy": FakeSourceAdapter(
            "jobicy",
            [
                {
                    "id": "job-unique",
                    "title": "Frontend Engineer",
                    "company": "OtherCorp",
                }
            ],
        ),
        "remoteok": DuplicateAdapter(
            "remoteok",
            [
                {
                    "id": "rem-shared",
                    "title": "Staff Python Engineer",
                    "company": "GlobalCorp",
                }
            ],
        ),
    }

    chunks: list[str] = []
    async for chunk in service.stream_live_sync(
        adapters=second_adapters, observed_at=SEEN_AT
    ):
        chunks.append(chunk)

    events = _parse_sse_events(chunks)
    completed_event = next(e[1] for e in events if e[0] == "sync_completed")
    assert completed_event["status"] == "success"
    assert completed_event["total_inserted"] == 2

    async with factory() as session:
        posting_count = await session.scalar(
            select(func.count()).select_from(SourcePostingRow)
        )
        group_count = await session.scalar(
            select(func.count()).select_from(JobGroupRow)
        )
        # 3 postings total in DB
        assert posting_count == 3
        # Himalayas and Remote OK deduplicated into 1 group
        # Jobicy into 1 group -> 2 total groups
        assert group_count == 2

    await engine.dispose()


def create_async_engine_helper(db_url: str) -> Any:
    return create_engine(db_url)
