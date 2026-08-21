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
    UpstreamSchemaError,
    redact_text,
)
from job_engine.sources.jobicy import JobicyAdapter

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "jobicy"
SEEN_AT = datetime(2026, 8, 16, 23, 0, tzinfo=UTC)


def _load(name: str) -> dict[str, Any]:
    payload = json.loads((FIXTURE_DIR / name).read_text())
    assert isinstance(payload, dict)
    return payload


def _settings(**overrides: object) -> Settings:
    payload: dict[str, object] = {
        "jobicy_base_url": "https://jobicy.com",
        "jobicy_count": 100,
        "jobicy_max_windows": 3,
        "jobicy_max_retries": 1,
    }
    payload.update(overrides)
    return Settings.model_validate(payload)


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://jobicy.com",
    )


def _query(request: httpx.Request) -> dict[str, list[str]]:
    return parse_qs(urlparse(str(request.url)).query)


async def test_fetch_page_uses_three_windows() -> None:
    requests: list[httpx.Request] = []
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=success)

    adapter = JobicyAdapter(_settings(), client=_client(handler))
    first = await adapter.fetch_page(None)
    assert first.next_cursor == PageCursor(window="latam", page=1)
    second = await adapter.fetch_page(first.next_cursor)
    assert second.next_cursor == PageCursor(window="engineering", page=1)
    third = await adapter.fetch_page(second.next_cursor)
    assert third.next_cursor is None

    brazil = _query(requests[0])
    assert brazil["geo"] == ["brazil"]
    assert brazil["count"] == ["100"]
    assert "industry" not in brazil
    latam = _query(requests[1])
    assert latam["geo"] == ["latam"]
    engineering = _query(requests[2])
    assert engineering["industry"] == ["engineering"]
    assert "geo" not in engineering


async def test_fetch_page_dedups_id_across_windows() -> None:
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=success)

    adapter = JobicyAdapter(_settings(), client=_client(handler))
    first = await adapter.fetch_page(None)
    second = await adapter.fetch_page(first.next_cursor)
    assert first.fetched_count == 3
    assert second.fetched_count == 3
    assert second.raw_records == ()


def test_map_candidate_field_map() -> None:
    adapter = JobicyAdapter(_settings())
    job = adapter.parse_record(_load("success.json")["jobs"][0])
    candidate = adapter.map_candidate(job, run_id=uuid4(), seen_at=SEEN_AT)
    assert candidate.source_id == "jobicy"
    assert candidate.source_posting_id == "150001"
    assert candidate.listing_url.endswith("/150001-python-engineer-brazil")
    assert candidate.remote_evidence == "remote"
    assert candidate.location_eligibility_evidence == "Brazil"
    assert candidate.location_original == "Brazil"
    assert candidate.compensation_period == "yearly"
    assert candidate.compensation_minimum is not None
    assert candidate.seniority_evidence == "Senior"
    assert candidate.status is JobStatus.ACTIVE
    assert candidate.closed_at is None
    assert candidate.raw_source_metadata is not None
    assert "description" not in candidate.raw_source_metadata
    assert "jobDescription" not in candidate.raw_source_metadata
    assert "Build APIs" not in str(candidate.raw_source_metadata)


def test_map_candidate_omitted_salary_and_any_level() -> None:
    adapter = JobicyAdapter(_settings())
    jobs = _load("success.json")["jobs"]
    latam = adapter.map_candidate(
        adapter.parse_record(jobs[1]), run_id=uuid4(), seen_at=SEEN_AT
    )
    assert latam.location_eligibility_evidence == "LATAM"
    assert latam.seniority_evidence is None
    assert latam.compensation_minimum is None
    assert latam.compensation_original_text is None
    assert latam.status is JobStatus.ACTIVE
    anywhere = adapter.map_candidate(
        adapter.parse_record(jobs[2]), run_id=uuid4(), seen_at=SEEN_AT
    )
    assert anywhere.location_eligibility_evidence == "Anywhere"
    assert anywhere.technologies_original_text == (
        "Finance & Accounting, Software Engineering"
    )
    assert anywhere.status is JobStatus.ACTIVE


def test_malformed_fixture_missing_id() -> None:
    adapter = JobicyAdapter(_settings())
    raw = _load("malformed.json")["jobs"][0]
    with pytest.raises(RecordValidationError, match="id"):
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

    adapter = JobicyAdapter(_settings(), client=_client(handler), sleeper=sleeper)
    with pytest.raises(RateLimitError) as exc_info:
        await adapter.fetch_page(None)
    assert attempts["count"] == 2
    assert exc_info.value.retry_after_seconds == 1.0
    assert "authorization" not in str(exc_info.value).casefold()


async def test_http_400_does_not_retry() -> None:
    attempts = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        return httpx.Response(400, json={"error": "Invalid geo"})

    adapter = JobicyAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError):
        await adapter.fetch_page(None)
    assert attempts["count"] == 1


async def test_missing_jobs_envelope_is_schema_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"success": True, "jobCount": 1})

    adapter = JobicyAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError, match="jobs"):
        await adapter.fetch_page(None)


async def test_non_object_job_is_schema_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"jobs": ["not-an-object"], "success": True})

    adapter = JobicyAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError, match="object"):
        await adapter.fetch_page(None)


def test_redact_text_strips_secrets() -> None:
    message = redact_text("Authorization: Bearer super-secret-token failed")
    assert "super-secret-token" not in message
    assert "[redacted]" in message
