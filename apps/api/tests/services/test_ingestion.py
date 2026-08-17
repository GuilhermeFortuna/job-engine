from __future__ import annotations

import json
import os
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.config import Settings
from job_engine.db.models import JobGroup as JobGroupRow
from job_engine.db.models import SourcePosting as SourcePostingRow
from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import IngestionRunStatus, JobStatus
from job_engine.domain.jobs import SourcePosting
from job_engine.services.ingestion import resolve_group_lifecycle, run_ingestion
from job_engine.sources.base import PageCursor, SourcePage
from job_engine.sources.himalayas import HimalayasAdapter
from job_engine.sources.jobicy import JobicyAdapter
from job_engine.sources.remoteok import RemoteokAdapter

FIXTURE_DIR = Path(__file__).resolve().parents[1] / "sources" / "fixtures" / "himalayas"
SEEN_AT = datetime(2026, 8, 16, 23, 0, tzinfo=UTC)


def _load(name: str) -> dict[str, Any]:
    payload = json.loads((FIXTURE_DIR / name).read_text())
    assert isinstance(payload, dict)
    return payload


def _empty_page() -> dict[str, Any]:
    return {
        "updatedAt": 1740300000000,
        "offset": 0,
        "limit": 20,
        "totalCount": 0,
        "jobs": [],
    }


def _settings() -> Settings:
    return Settings.model_validate(
        {
            "himalayas_base_url": "https://himalayas.app",
            "himalayas_max_pages_per_window": 1,
            "himalayas_max_retries": 1,
        }
    )


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://himalayas.app",
    )


def _adapter(handler: Any) -> HimalayasAdapter:
    return HimalayasAdapter(_settings(), client=_client(handler))


def _is_brazil(request: httpx.Request) -> bool:
    return "country" in parse_qs(urlparse(str(request.url)).query)


async def _count_postings(session: AsyncSession) -> int:
    value = await session.scalar(select(func.count()).select_from(SourcePostingRow))
    return int(value or 0)


async def _count_groups(session: AsyncSession) -> int:
    value = await session.scalar(select(func.count()).select_from(JobGroupRow))
    return int(value or 0)


async def _ingest(session: AsyncSession, handler: Any) -> Any:
    return await run_ingestion(
        session,
        "himalayas",
        _settings(),
        adapter=_adapter(handler),
    )


def test_resolve_group_lifecycle_precedence() -> None:
    def posting(status: JobStatus, closed_at: datetime | None = None) -> SourcePosting:
        return SourcePosting.model_validate(
            {
                "id": "00000000-0000-0000-0000-000000000001",
                "source_id": "himalayas",
                "source_posting_id": status.value,
                "source_name": "Himalayas",
                "application_url": f"https://himalayas.app/jobs/{status.value}",
                "application_url_canonical": f"https://himalayas.app/jobs/{status.value}",
                "title_original": "Engineer",
                "company_original": "Acme",
                "remote_status": "remote",
                "employment_type": "full_time",
                "seniority": "unknown",
                "first_seen_at": SEEN_AT,
                "last_seen_at": SEEN_AT,
                "status": status,
                "closed_at": closed_at,
            }
        )

    status, closed_at = resolve_group_lifecycle(
        (
            posting(JobStatus.CLOSED, SEEN_AT),
            posting(JobStatus.STALE),
            posting(JobStatus.UNKNOWN),
            posting(JobStatus.ACTIVE),
        ),
        seen_at=SEEN_AT,
    )
    assert status is JobStatus.ACTIVE
    assert closed_at is None

    status, closed_at = resolve_group_lifecycle(
        (posting(JobStatus.CLOSED, SEEN_AT), posting(JobStatus.UNKNOWN)),
        seen_at=SEEN_AT,
    )
    assert status is JobStatus.UNKNOWN
    assert closed_at is None

    earlier = datetime(2026, 1, 1, tzinfo=UTC)
    later = datetime(2026, 2, 1, tzinfo=UTC)
    status, closed_at = resolve_group_lifecycle(
        (posting(JobStatus.CLOSED, earlier), posting(JobStatus.CLOSED, later)),
        seen_at=SEEN_AT,
    )
    assert status is JobStatus.CLOSED
    assert closed_at == later


async def test_fixture_ingestion_persists_provenance(db_session: AsyncSession) -> None:
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    run = await _ingest(db_session, handler)
    assert run.status is IngestionRunStatus.SUCCESS
    assert await _count_postings(db_session) == 3
    assert await _count_groups(db_session) == 3
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("himalayas", "globex-python-engineer")
    assert posting is not None
    assert posting.source_name == "Himalayas"
    assert posting.adapter_version == "himalayas-1"
    assert posting.ingestion_run_id == run.id
    expired = await repo.get_source_posting("himalayas", "initech-backend-engineer")
    assert expired is not None
    assert expired.status is JobStatus.CLOSED
    group = await repo.get_job_group_by_source_posting(
        "himalayas", "initech-backend-engineer"
    )
    assert group is not None
    assert group.status is JobStatus.CLOSED
    assert group.closed_at is not None


async def test_repeated_ingestion_is_idempotent(db_session: AsyncSession) -> None:
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    first = await _ingest(db_session, handler)
    second = await _ingest(db_session, handler)
    assert first.inserted_count == 3
    assert second.inserted_count == 0
    assert second.updated_count == 3
    assert await _count_postings(db_session) == 3
    assert await _count_groups(db_session) == 3


async def test_malformed_record_keeps_valid(db_session: AsyncSession) -> None:
    success = _load("success.json")
    malformed = _load("malformed.json")
    payload = dict(success)
    payload["jobs"] = [success["jobs"][0], malformed["jobs"][0]]
    payload["totalCount"] = 2

    def handler(request: httpx.Request) -> httpx.Response:
        if _is_brazil(request):
            return httpx.Response(200, json=_empty_page())
        return httpx.Response(200, json=payload)

    run = await _ingest(db_session, handler)
    assert run.status is IngestionRunStatus.PARTIAL_SUCCESS
    assert run.accepted_count == 1
    assert run.rejected_count == 1
    assert await _count_postings(db_session) == 1
    assert run.error_summaries
    assert all("bearer" not in item.message.casefold() for item in run.error_summaries)


async def test_expiry_closes_on_partial_success(db_session: AsyncSession) -> None:
    success = _load("success.json")
    malformed = _load("malformed.json")
    payload = dict(success)
    payload["jobs"] = [success["jobs"][1], malformed["jobs"][0]]
    payload["totalCount"] = 2

    def handler(request: httpx.Request) -> httpx.Response:
        if _is_brazil(request):
            return httpx.Response(200, json=_empty_page())
        return httpx.Response(200, json=payload)

    run = await _ingest(db_session, handler)
    assert run.status is IngestionRunStatus.PARTIAL_SUCCESS
    assert run.marked_closed_count == 1
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("himalayas", "initech-backend-engineer")
    assert posting is not None
    assert posting.status is JobStatus.CLOSED


async def test_transport_failure_does_not_stale(db_session: AsyncSession) -> None:
    success = _load("success.json")
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 2:
            return httpx.Response(200, json=success)
        raise httpx.ConnectError("down", request=request)

    first = await _ingest(db_session, handler)
    assert first.status is IngestionRunStatus.SUCCESS
    failed = await _ingest(db_session, handler)
    assert failed.status is IngestionRunStatus.FAILURE
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("himalayas", "globex-python-engineer")
    assert posting is not None
    assert posting.status is JobStatus.ACTIVE


async def test_partial_success_does_not_count_as_miss(db_session: AsyncSession) -> None:
    success = _load("success.json")
    mixed = dict(success)
    mixed["jobs"] = [success["jobs"][0], _load("malformed.json")["jobs"][0]]
    mixed["totalCount"] = 2
    empty = _empty_page()
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 2:
            return httpx.Response(200, json=success)
        if calls["count"] <= 4:
            return httpx.Response(200, json=mixed)
        return httpx.Response(200, json=empty)

    await _ingest(db_session, handler)
    partial = await _ingest(db_session, handler)
    assert partial.status is IngestionRunStatus.PARTIAL_SUCCESS
    missing = await _ingest(db_session, handler)
    assert missing.status is IngestionRunStatus.SUCCESS
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("himalayas", "initech-backend-engineer")
    assert posting is not None
    assert posting.status is not JobStatus.STALE


async def test_two_successful_misses_mark_stale(db_session: AsyncSession) -> None:
    success = _load("success.json")
    empty = _empty_page()
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 2:
            return httpx.Response(200, json=success)
        return httpx.Response(200, json=empty)

    first = await _ingest(db_session, handler)
    assert first.status is IngestionRunStatus.SUCCESS
    second = await _ingest(db_session, handler)
    assert second.status is IngestionRunStatus.SUCCESS
    assert second.marked_stale_count == 0
    third = await _ingest(db_session, handler)
    assert third.status is IngestionRunStatus.SUCCESS
    assert third.marked_stale_count == 2
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("himalayas", "globex-python-engineer")
    assert posting is not None
    assert posting.status is JobStatus.STALE
    closed = await repo.get_source_posting("himalayas", "initech-backend-engineer")
    assert closed is not None
    assert closed.status is JobStatus.CLOSED
    group = await repo.get_job_group_by_source_posting(
        "himalayas", "globex-python-engineer"
    )
    assert group is not None
    assert group.status is JobStatus.STALE
    assert group.closed_at is None


class _OnePageWorldwideAdapter(HimalayasAdapter):
    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        page = await super().fetch_page(cursor)
        return SourcePage(
            raw_records=page.raw_records,
            next_cursor=None,
            fetched_count=page.fetched_count,
        )


@pytest.mark.live
@pytest.mark.skipif(
    os.environ.get("JOB_ENGINE_LIVE_SMOKE") != "1",
    reason="set JOB_ENGINE_LIVE_SMOKE=1 for bounded Himalayas live smoke",
)
async def test_himalayas_live_smoke(db_session: AsyncSession) -> None:
    settings = Settings.model_validate({"himalayas_max_pages_per_window": 1})
    adapter = _OnePageWorldwideAdapter(settings)
    run = await run_ingestion(
        db_session,
        "himalayas",
        settings,
        adapter=adapter,
        seen_at=datetime.now(UTC),
    )
    assert run.status in {
        IngestionRunStatus.SUCCESS,
        IngestionRunStatus.PARTIAL_SUCCESS,
    }
    assert run.fetched_count >= 0
    print(
        {
            "status": run.status.value,
            "fetched_count": run.fetched_count,
            "accepted_count": run.accepted_count,
            "rejected_count": run.rejected_count,
            "inserted_count": run.inserted_count,
            "updated_count": run.updated_count,
            "marked_stale_count": run.marked_stale_count,
            "marked_closed_count": run.marked_closed_count,
        }
    )


JOBICY_FIXTURE_DIR = (
    Path(__file__).resolve().parents[1] / "sources" / "fixtures" / "jobicy"
)


def _load_jobicy(name: str) -> dict[str, Any]:
    payload = json.loads((JOBICY_FIXTURE_DIR / name).read_text())
    assert isinstance(payload, dict)
    return payload


def _empty_jobicy_page() -> dict[str, Any]:
    return {
        "apiVersion": "2.2.15",
        "jobCount": 0,
        "jobs": [],
        "statusCode": 200,
        "success": True,
    }


def _jobicy_settings() -> Settings:
    return Settings.model_validate(
        {
            "jobicy_base_url": "https://jobicy.com",
            "jobicy_count": 100,
            "jobicy_max_windows": 3,
            "jobicy_max_retries": 1,
        }
    )


def _jobicy_client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://jobicy.com",
    )


def _jobicy_adapter(handler: Any) -> JobicyAdapter:
    return JobicyAdapter(_jobicy_settings(), client=_jobicy_client(handler))


def _jobicy_window(request: httpx.Request) -> str:
    query = parse_qs(urlparse(str(request.url)).query)
    if "geo" in query:
        return query["geo"][0]
    if "industry" in query:
        return query["industry"][0]
    return ""


async def _ingest_jobicy(session: AsyncSession, handler: Any) -> Any:
    return await run_ingestion(
        session,
        "jobicy",
        _jobicy_settings(),
        adapter=_jobicy_adapter(handler),
    )


async def test_jobicy_fixture_ingestion_persists_provenance(
    db_session: AsyncSession,
) -> None:
    success = _load_jobicy("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        if _jobicy_window(request) == "brazil":
            return httpx.Response(200, json=success)
        return httpx.Response(200, json=_empty_jobicy_page())

    run = await _ingest_jobicy(db_session, handler)
    assert run.status is IngestionRunStatus.SUCCESS
    assert await _count_postings(db_session) == 3
    assert await _count_groups(db_session) == 3
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("jobicy", "150001")
    assert posting is not None
    assert posting.source_name == "Jobicy"
    assert posting.adapter_version == "jobicy-1"
    assert posting.ingestion_run_id == run.id
    assert posting.status is JobStatus.ACTIVE
    assert run.marked_closed_count == 0
    for posting_id in ("150001", "150002", "150003"):
        loaded = await repo.get_source_posting("jobicy", posting_id)
        assert loaded is not None
        assert loaded.status is JobStatus.ACTIVE


async def test_jobicy_repeated_ingestion_is_idempotent(
    db_session: AsyncSession,
) -> None:
    success = _load_jobicy("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        if _jobicy_window(request) == "brazil":
            return httpx.Response(200, json=success)
        return httpx.Response(200, json=_empty_jobicy_page())

    first = await _ingest_jobicy(db_session, handler)
    second = await _ingest_jobicy(db_session, handler)
    assert first.inserted_count == 3
    assert second.inserted_count == 0
    assert second.updated_count == 3
    assert await _count_postings(db_session) == 3
    assert await _count_groups(db_session) == 3


async def test_jobicy_malformed_record_keeps_valid(db_session: AsyncSession) -> None:
    success = _load_jobicy("success.json")
    malformed = _load_jobicy("malformed.json")
    payload = dict(success)
    payload["jobs"] = [success["jobs"][0], malformed["jobs"][0]]
    payload["jobCount"] = 2

    def handler(request: httpx.Request) -> httpx.Response:
        if _jobicy_window(request) == "brazil":
            return httpx.Response(200, json=payload)
        return httpx.Response(200, json=_empty_jobicy_page())

    run = await _ingest_jobicy(db_session, handler)
    assert run.status is IngestionRunStatus.PARTIAL_SUCCESS
    assert run.accepted_count == 1
    assert run.rejected_count == 1
    assert await _count_postings(db_session) == 1
    assert run.error_summaries
    assert all("bearer" not in item.message.casefold() for item in run.error_summaries)


async def test_jobicy_does_not_close_from_payload(db_session: AsyncSession) -> None:
    success = _load_jobicy("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        if _jobicy_window(request) == "brazil":
            return httpx.Response(200, json=success)
        return httpx.Response(200, json=_empty_jobicy_page())

    run = await _ingest_jobicy(db_session, handler)
    assert run.marked_closed_count == 0
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("jobicy", "150002")
    assert posting is not None
    assert posting.status is JobStatus.ACTIVE
    assert posting.closed_at is None


async def test_jobicy_transport_failure_does_not_stale(
    db_session: AsyncSession,
) -> None:
    success = _load_jobicy("success.json")
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 3:
            if _jobicy_window(request) == "brazil":
                return httpx.Response(200, json=success)
            return httpx.Response(200, json=_empty_jobicy_page())
        raise httpx.ConnectError("down", request=request)

    first = await _ingest_jobicy(db_session, handler)
    assert first.status is IngestionRunStatus.SUCCESS
    failed = await _ingest_jobicy(db_session, handler)
    assert failed.status is IngestionRunStatus.FAILURE
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("jobicy", "150001")
    assert posting is not None
    assert posting.status is JobStatus.ACTIVE


async def test_jobicy_three_successful_misses_mark_stale(
    db_session: AsyncSession,
) -> None:
    success = _load_jobicy("success.json")
    empty = _empty_jobicy_page()
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 3:
            if _jobicy_window(request) == "brazil":
                return httpx.Response(200, json=success)
            return httpx.Response(200, json=empty)
        return httpx.Response(200, json=empty)

    first = await _ingest_jobicy(db_session, handler)
    assert first.status is IngestionRunStatus.SUCCESS
    second = await _ingest_jobicy(db_session, handler)
    assert second.status is IngestionRunStatus.SUCCESS
    assert second.marked_stale_count == 0
    third = await _ingest_jobicy(db_session, handler)
    assert third.status is IngestionRunStatus.SUCCESS
    assert third.marked_stale_count == 0
    fourth = await _ingest_jobicy(db_session, handler)
    assert fourth.status is IngestionRunStatus.SUCCESS
    assert fourth.marked_stale_count == 3
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("jobicy", "150001")
    assert posting is not None
    assert posting.status is JobStatus.STALE
    group = await repo.get_job_group_by_source_posting("jobicy", "150001")
    assert group is not None
    assert group.status is JobStatus.STALE
    assert group.closed_at is None


@pytest.mark.live
@pytest.mark.skipif(
    os.environ.get("JOB_ENGINE_LIVE_SMOKE") != "1",
    reason="set JOB_ENGINE_LIVE_SMOKE=1 for bounded Jobicy live smoke",
)
async def test_jobicy_live_smoke(db_session: AsyncSession) -> None:
    settings = Settings.model_validate({"jobicy_max_windows": 1, "jobicy_count": 10})
    run = await run_ingestion(
        db_session,
        "jobicy",
        settings,
        seen_at=datetime.now(UTC),
    )
    assert run.status in {
        IngestionRunStatus.SUCCESS,
        IngestionRunStatus.PARTIAL_SUCCESS,
    }
    assert run.fetched_count >= 0
    assert run.marked_closed_count == 0
    print(
        {
            "status": run.status.value,
            "fetched_count": run.fetched_count,
            "accepted_count": run.accepted_count,
            "rejected_count": run.rejected_count,
            "inserted_count": run.inserted_count,
            "updated_count": run.updated_count,
            "marked_stale_count": run.marked_stale_count,
            "marked_closed_count": run.marked_closed_count,
        }
    )


REMOTEOK_FIXTURE_DIR = (
    Path(__file__).resolve().parents[1] / "sources" / "fixtures" / "remoteok"
)


def _load_remoteok(name: str) -> list[Any]:
    payload = json.loads((REMOTEOK_FIXTURE_DIR / name).read_text())
    assert isinstance(payload, list)
    return payload


def _empty_remoteok_page() -> list[dict[str, str]]:
    return [{"legal": "Credit Remote OK and link the original listing URL."}]


def _remoteok_settings() -> Settings:
    return Settings.model_validate(
        {
            "remoteok_base_url": "https://remoteok.com",
            "remoteok_max_retries": 1,
        }
    )


def _remoteok_client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://remoteok.com",
    )


def _remoteok_adapter(handler: Any) -> RemoteokAdapter:
    return RemoteokAdapter(_remoteok_settings(), client=_remoteok_client(handler))


async def _ingest_remoteok(session: AsyncSession, handler: Any) -> Any:
    return await run_ingestion(
        session,
        "remoteok",
        _remoteok_settings(),
        adapter=_remoteok_adapter(handler),
    )


async def test_remoteok_fixture_ingestion_persists_provenance(
    db_session: AsyncSession,
) -> None:
    success = _load_remoteok("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    run = await _ingest_remoteok(db_session, handler)
    assert run.status is IngestionRunStatus.SUCCESS
    assert await _count_postings(db_session) == 3
    assert await _count_groups(db_session) == 3
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("remoteok", "200001")
    assert posting is not None
    assert posting.source_name == "Remote OK"
    assert posting.adapter_version == "remoteok-1"
    assert posting.ingestion_run_id == run.id
    assert posting.status is JobStatus.ACTIVE
    assert run.marked_closed_count == 0
    for posting_id in ("200001", "200002", "200003"):
        loaded = await repo.get_source_posting("remoteok", posting_id)
        assert loaded is not None
        assert loaded.status is JobStatus.ACTIVE


async def test_remoteok_repeated_ingestion_is_idempotent(
    db_session: AsyncSession,
) -> None:
    success = _load_remoteok("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    first = await _ingest_remoteok(db_session, handler)
    second = await _ingest_remoteok(db_session, handler)
    assert first.inserted_count == 3
    assert second.inserted_count == 0
    assert second.updated_count == 3
    assert await _count_postings(db_session) == 3
    assert await _count_groups(db_session) == 3


async def test_remoteok_malformed_record_keeps_valid(db_session: AsyncSession) -> None:
    success = _load_remoteok("success.json")
    malformed = _load_remoteok("malformed.json")
    payload = [success[0], success[1], malformed[1]]

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=payload)

    run = await _ingest_remoteok(db_session, handler)
    assert run.status is IngestionRunStatus.PARTIAL_SUCCESS
    assert run.accepted_count == 1
    assert run.rejected_count == 1
    assert await _count_postings(db_session) == 1
    assert run.error_summaries
    assert all("bearer" not in item.message.casefold() for item in run.error_summaries)


async def test_remoteok_does_not_close_from_payload(db_session: AsyncSession) -> None:
    success = _load_remoteok("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    run = await _ingest_remoteok(db_session, handler)
    assert run.marked_closed_count == 0
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("remoteok", "200002")
    assert posting is not None
    assert posting.status is JobStatus.ACTIVE
    assert posting.closed_at is None


async def test_remoteok_transport_failure_does_not_stale(
    db_session: AsyncSession,
) -> None:
    success = _load_remoteok("success.json")
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 1:
            return httpx.Response(200, json=success)
        raise httpx.ConnectError("down", request=request)

    first = await _ingest_remoteok(db_session, handler)
    assert first.status is IngestionRunStatus.SUCCESS
    failed = await _ingest_remoteok(db_session, handler)
    assert failed.status is IngestionRunStatus.FAILURE
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("remoteok", "200001")
    assert posting is not None
    assert posting.status is JobStatus.ACTIVE


async def test_remoteok_three_successful_misses_mark_stale(
    db_session: AsyncSession,
) -> None:
    success = _load_remoteok("success.json")
    empty = _empty_remoteok_page()
    calls = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["count"] += 1
        if calls["count"] <= 1:
            return httpx.Response(200, json=success)
        return httpx.Response(200, json=empty)

    first = await _ingest_remoteok(db_session, handler)
    assert first.status is IngestionRunStatus.SUCCESS
    second = await _ingest_remoteok(db_session, handler)
    assert second.status is IngestionRunStatus.SUCCESS
    assert second.marked_stale_count == 0
    third = await _ingest_remoteok(db_session, handler)
    assert third.status is IngestionRunStatus.SUCCESS
    assert third.marked_stale_count == 0
    fourth = await _ingest_remoteok(db_session, handler)
    assert fourth.status is IngestionRunStatus.SUCCESS
    assert fourth.marked_stale_count == 3
    repo = CatalogRepository(db_session)
    posting = await repo.get_source_posting("remoteok", "200001")
    assert posting is not None
    assert posting.status is JobStatus.STALE
    group = await repo.get_job_group_by_source_posting("remoteok", "200001")
    assert group is not None
    assert group.status is JobStatus.STALE
    assert group.closed_at is None


@pytest.mark.live
@pytest.mark.skipif(
    os.environ.get("JOB_ENGINE_LIVE_SMOKE") != "1",
    reason="set JOB_ENGINE_LIVE_SMOKE=1 for bounded Remote OK live smoke",
)
async def test_remoteok_live_smoke(db_session: AsyncSession) -> None:
    settings = Settings()
    run = await run_ingestion(
        db_session,
        "remoteok",
        settings,
        seen_at=datetime.now(UTC),
    )
    assert run.status in {
        IngestionRunStatus.SUCCESS,
        IngestionRunStatus.PARTIAL_SUCCESS,
    }
    assert run.fetched_count >= 0
    assert run.marked_closed_count == 0
    print(
        {
            "status": run.status.value,
            "fetched_count": run.fetched_count,
            "accepted_count": run.accepted_count,
            "rejected_count": run.rejected_count,
            "inserted_count": run.inserted_count,
            "updated_count": run.updated_count,
            "marked_stale_count": run.marked_stale_count,
            "marked_closed_count": run.marked_closed_count,
        }
    )
