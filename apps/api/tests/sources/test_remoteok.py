from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any
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
from job_engine.sources.remoteok import RemoteokAdapter

FIXTURE_DIR = Path(__file__).parent / "fixtures" / "remoteok"
SEEN_AT = datetime(2026, 8, 16, 23, 0, tzinfo=UTC)


def _load(name: str) -> list[Any]:
    payload = json.loads((FIXTURE_DIR / name).read_text())
    assert isinstance(payload, list)
    return payload


def _settings(**overrides: object) -> Settings:
    payload: dict[str, object] = {
        "remoteok_base_url": "https://remoteok.com",
        "remoteok_max_retries": 1,
    }
    payload.update(overrides)
    return Settings.model_validate(payload)


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(
        transport=httpx.MockTransport(handler),
        base_url="https://remoteok.com",
    )


async def test_fetch_page_skips_legal_object_and_is_one_page() -> None:
    requests: list[httpx.Request] = []
    success = _load("success.json")

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(request)
        return httpx.Response(200, json=success)

    adapter = RemoteokAdapter(_settings(), client=_client(handler))
    page = await adapter.fetch_page(None)
    assert page.next_cursor is None
    assert page.fetched_count == 3
    assert len(page.raw_records) == 3
    assert all(
        isinstance(item, dict) and "legal" not in item for item in page.raw_records
    )
    assert str(requests[0].url).endswith("/api")


async def test_fetch_page_rejects_unexpected_cursor() -> None:
    adapter = RemoteokAdapter(_settings())
    with pytest.raises(UpstreamSchemaError, match="cursor"):
        await adapter.fetch_page(PageCursor(window="snapshot", page=2))


def test_map_candidate_field_map() -> None:
    adapter = RemoteokAdapter(_settings())
    job = adapter.parse_record(_load("success.json")[1])
    candidate = adapter.map_candidate(job, run_id=uuid4(), seen_at=SEEN_AT)
    assert candidate.source_id == "remoteok"
    assert candidate.source_posting_id == "200001"
    assert candidate.application_url.endswith("/200001-python-engineer")
    assert candidate.remote_evidence == "remote"
    assert candidate.location_original == "Lisbon"
    assert candidate.location_eligibility_evidence == "Lisbon"
    assert candidate.compensation_minimum is not None
    assert candidate.compensation_maximum is not None
    assert candidate.technologies_original_text == "dev, python"
    assert candidate.employment_type_evidence is None
    assert candidate.seniority_evidence is None
    assert candidate.status is JobStatus.ACTIVE
    assert candidate.closed_at is None
    assert candidate.raw_source_metadata is not None
    assert "description" not in candidate.raw_source_metadata
    assert "legal" not in candidate.raw_source_metadata
    assert "Build APIs" not in str(candidate.raw_source_metadata)


def test_map_candidate_zero_salary_and_noisy_location() -> None:
    adapter = RemoteokAdapter(_settings())
    jobs = _load("success.json")
    zero_salary = adapter.map_candidate(
        adapter.parse_record(jobs[2]), run_id=uuid4(), seen_at=SEEN_AT
    )
    assert zero_salary.source_posting_id == "200002"
    assert zero_salary.location_original == "Evansville,"
    assert zero_salary.location_eligibility_evidence == "Evansville,"
    assert zero_salary.compensation_minimum is None
    assert zero_salary.compensation_maximum is None
    assert zero_salary.compensation_original_text is None
    assert zero_salary.status is JobStatus.ACTIVE
    ops = adapter.map_candidate(
        adapter.parse_record(jobs[3]), run_id=uuid4(), seen_at=SEEN_AT
    )
    assert ops.source_posting_id == "200003"
    assert ops.technologies_original_text == "ops"
    assert ops.compensation_minimum is None
    assert ops.status is JobStatus.ACTIVE


def test_malformed_fixture_missing_id() -> None:
    adapter = RemoteokAdapter(_settings())
    raw = _load("malformed.json")[1]
    with pytest.raises(RecordValidationError, match="id"):
        adapter.parse_record(raw)


def test_parse_record_rejects_missing_required_fields() -> None:
    adapter = RemoteokAdapter(_settings())
    with pytest.raises(RecordValidationError, match="url"):
        adapter.parse_record({"id": 1, "position": "Engineer", "company": "Acme"})
    with pytest.raises(RecordValidationError, match="position"):
        adapter.parse_record(
            {
                "id": 1,
                "url": "https://remoteok.com/remote-jobs/1",
                "company": "Acme",
            }
        )
    with pytest.raises(RecordValidationError, match="company"):
        adapter.parse_record(
            {
                "id": 1,
                "url": "https://remoteok.com/remote-jobs/1",
                "position": "Engineer",
            }
        )


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

    adapter = RemoteokAdapter(_settings(), client=_client(handler), sleeper=sleeper)
    with pytest.raises(RateLimitError) as exc_info:
        await adapter.fetch_page(None)
    assert attempts["count"] == 2
    assert exc_info.value.retry_after_seconds == 1.0
    assert "authorization" not in str(exc_info.value).casefold()


async def test_http_400_does_not_retry() -> None:
    attempts = {"count": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        attempts["count"] += 1
        return httpx.Response(400, json={"error": "Invalid request"})

    adapter = RemoteokAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError):
        await adapter.fetch_page(None)
    assert attempts["count"] == 1


async def test_non_array_envelope_is_schema_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"jobs": []})

    adapter = RemoteokAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError, match="array"):
        await adapter.fetch_page(None)


async def test_non_object_job_is_schema_error() -> None:
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=[{"legal": "ok"}, "not-an-object"])

    adapter = RemoteokAdapter(_settings(), client=_client(handler))
    with pytest.raises(UpstreamSchemaError, match="object"):
        await adapter.fetch_page(None)


def test_redact_text_strips_secrets() -> None:
    message = redact_text("Authorization: Bearer super-secret-token failed")
    assert "super-secret-token" not in message
    assert "[redacted]" in message
