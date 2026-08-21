from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import httpx
import pytest

from job_engine.config import Settings
from job_engine.domain.enums import JobStatus
from job_engine.sources.base import (
    PageCursor,
    RateLimitError,
    RecordValidationError,
    TransportError,
    UpstreamSchemaError,
    fetch_json,
    redact_text,
)
from job_engine.sources.himalayas import HimalayasAdapter

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "himalayas"
SEEN_AT = datetime(2026, 8, 16, 23, 0, tzinfo=UTC)


def _load(name: str) -> dict[str, Any]:
    payload = json.loads((FIXTURE_DIR / name).read_text())
    assert isinstance(payload, dict)
    return payload


def _settings(**overrides: object) -> Settings:
    payload: dict[str, object] = {
        "himalayas_base_url": "https://himalayas.app",
        "himalayas_max_pages_per_window": 2,
        "himalayas_max_retries": 1,
    }
    payload.update(overrides)
    return Settings.model_validate(payload)


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://himalayas.app",
    )


def _query(request: httpx.Request) -> dict[str, list[str]]:
    return parse_qs(urlparse(str(request.url)).query)


async def test_fetch_page_uses_disjoint_windows_and_paginates() -> None:
    requests: list[httpx.Request] = []
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        query = _query(request)
        page = int(query.get("page", ["1"])[0])
        payload = dict(success)
        if "country" in query:
            payload["totalCount"] = 3
            payload["limit"] = 20
            payload["jobs"] = success["jobs"]
        else:
            payload["totalCount"] = 25
            payload["limit"] = 20
            payload["jobs"] = success["jobs"] if page == 1 else [success["jobs"][0]]
        return httpx.Response(200, json=payload)

    adapter = HimalayasAdapter(_settings(), client=_client(handler))
    first = await adapter.fetch_page(None)
    assert first.next_cursor == PageCursor(window="worldwide", page=2)
    second = await adapter.fetch_page(first.next_cursor)
    assert second.next_cursor == PageCursor(window="brazil", page=1)
    brazil = await adapter.fetch_page(second.next_cursor)
    assert brazil.next_cursor is None

    worldwide = _query(requests[0])
    assert worldwide["worldwide"] == ["true"]
    assert worldwide["sort"] == ["recent"]
    assert "country" not in worldwide
    brazil_query = _query(requests[2])
    assert brazil_query["country"] == ["Brazil"]
    assert brazil_query["exclude_worldwide"] == ["true"]
    assert brazil_query["sort"] == ["recent"]


async def test_fetch_page_dedups_guid_across_windows() -> None:
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    adapter = HimalayasAdapter(_settings(), client=_client(handler))
    first = await adapter.fetch_page(None)
    second = await adapter.fetch_page(first.next_cursor)
    assert first.fetched_count == 3
    assert second.fetched_count == 3
    assert second.raw_records == ()


def test_map_candidate_field_map() -> None:
    adapter = HimalayasAdapter(_settings())
    job = adapter.parse_record(_load("success.json")["jobs"][0])
    candidate = adapter.map_candidate(job, run_id=uuid4(), seen_at=SEEN_AT)
    assert candidate.source_id == "himalayas"
    assert candidate.source_posting_id == "globex-python-engineer"
    assert candidate.listing_url.endswith("/python-engineer")
    assert candidate.remote_evidence == "remote"
    assert candidate.location_eligibility_evidence == "worldwide"
    assert candidate.location_original == "Worldwide"
    assert candidate.compensation_period == "year"
    assert candidate.compensation_minimum is not None
    assert candidate.status is JobStatus.ACTIVE
    assert candidate.raw_source_metadata is not None
    assert "description" not in candidate.raw_source_metadata
    assert "Build APIs" not in str(candidate.raw_source_metadata)


def test_map_candidate_accepts_string_and_object_restrictions() -> None:
    adapter = HimalayasAdapter(_settings())
    jobs = _load("success.json")["jobs"]
    brazil = adapter.map_candidate(
        adapter.parse_record(jobs[1]), run_id=uuid4(), seen_at=SEEN_AT
    )
    assert brazil.location_eligibility_evidence == "Brazil"
    assert brazil.status is JobStatus.CLOSED
    assert brazil.closed_at is not None
    assert brazil.compensation_minimum is None
    assert brazil.compensation_maximum is None
    assert brazil.compensation_original_text is None
    object_restrictions = adapter.map_candidate(
        adapter.parse_record(jobs[2]), run_id=uuid4(), seen_at=SEEN_AT
    )
    assert object_restrictions.location_original == "Brazil"
    assert object_restrictions.compensation_period == "hour"


def test_malformed_fixture_missing_guid() -> None:
    adapter = HimalayasAdapter(_settings())
    raw = _load("malformed.json")["jobs"][0]
    with pytest.raises(RecordValidationError, match="guid"):
        adapter.parse_record(raw)


async def test_rate_limit_retries_once_then_raises() -> None:
    attempts = {"count": 0}

    async def sleeper(seconds: float) -> None:
        assert seconds == 1.0

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        return httpx.Response(
            429,
            json={"error": "Rate limit exceeded"},
            headers={"Retry-After": "1"},
        )

    adapter = HimalayasAdapter(_settings(), client=_client(handler), sleeper=sleeper)
    with pytest.raises(RateLimitError) as exc_info:
        await adapter.fetch_page(None)
    assert attempts["count"] == 2
    assert exc_info.value.retry_after_seconds == 1.0
    assert "authorization" not in str(exc_info.value).casefold()


async def test_http_400_does_not_retry() -> None:
    attempts = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        return httpx.Response(400, json={"error": "Invalid country"})

    adapter = HimalayasAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError):
        await adapter.fetch_page(None)
    assert attempts["count"] == 1


async def test_missing_jobs_envelope_is_schema_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"totalCount": 1})

    adapter = HimalayasAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError, match="jobs"):
        await adapter.fetch_page(None)


async def test_non_object_job_is_schema_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={"jobs": ["not-an-object"], "totalCount": 1, "limit": 20},
        )

    adapter = HimalayasAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError, match="object"):
        await adapter.fetch_page(None)


async def test_fetch_json_transport_retry_then_error() -> None:
    attempts = {"count": 0}

    async def sleeper(seconds: float) -> None:
        return None

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        raise httpx.ConnectError("connection failed", request=request)

    client = _client(handler)
    with pytest.raises(TransportError):
        await fetch_json(
            client,
            "https://himalayas.app/jobs/api/search",
            sleeper=sleeper,
            max_retries=1,
        )
    assert attempts["count"] == 2


def test_redact_text_strips_secrets() -> None:
    message = redact_text("Authorization: Bearer super-secret-token failed")
    assert "super-secret-token" not in message
    assert "[redacted]" in message
