from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import pytest

from job_engine.config import Settings
from job_engine.domain.enums import JobStatus
from job_engine.services.normalization import NormalizationCandidate
from job_engine.sources import registry as registry_mod
from job_engine.sources.base import (
    AdapterError,
    AuthorizationError,
    LifecycleSignal,
    PageCursor,
    RateLimitError,
    RecordValidationError,
    SourceAdapter,
    SourcePage,
    TransportError,
    UpstreamSchemaError,
)
from job_engine.sources.registry import UnknownSourceError, get_adapter, registered_ids


class _FakeAdapter:
    source_id = "fake"
    adapter_version = "fake-1"

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        return SourcePage(raw_records=(), next_cursor=None, fetched_count=0)

    def parse_record(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, dict) or "id" not in raw:
            raise RecordValidationError("missing id")
        return dict(raw)

    def map_candidate(
        self,
        parsed: Mapping[str, Any],
        *,
        run_id: object,
        seen_at: datetime,
    ) -> NormalizationCandidate:
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=str(parsed["id"]),
            source_name="Fake",
            application_url="https://example.com/jobs/1",
            title_original="Engineer",
            company_original="Acme",
            first_seen_at=seen_at,
            last_seen_at=seen_at,
        )

    def lifecycle_signal(
        self, parsed: Mapping[str, Any], *, seen_at: datetime
    ) -> LifecycleSignal:
        return LifecycleSignal(last_seen_at=seen_at, status=JobStatus.ACTIVE)


def test_adapter_errors_are_structured() -> None:
    assert issubclass(AuthorizationError, AdapterError)
    assert issubclass(RateLimitError, AdapterError)
    assert issubclass(TransportError, AdapterError)
    assert issubclass(UpstreamSchemaError, AdapterError)
    assert issubclass(RecordValidationError, AdapterError)
    error = RateLimitError("limited", retry_after_seconds=60)
    assert "limited" in str(error)
    assert error.retry_after_seconds == 60


def test_registered_himalayas_exposes_protocol() -> None:
    registry_mod._REGISTRY.pop("himalayas", None)
    adapter = get_adapter("himalayas", Settings())
    assert isinstance(adapter, SourceAdapter)
    assert adapter.source_id == "himalayas"
    assert adapter.adapter_version
    assert "himalayas" in registered_ids()


def test_unknown_source_id_raises() -> None:
    with pytest.raises(UnknownSourceError, match="not-a-source"):
        get_adapter("not-a-source", Settings())


async def test_fake_adapter_satisfies_protocol() -> None:
    adapter: SourceAdapter = _FakeAdapter(Settings())
    page = await adapter.fetch_page(None)
    assert page.next_cursor is None
    parsed = adapter.parse_record({"id": "abc"})
    seen_at = datetime(2026, 8, 16, tzinfo=UTC)
    candidate = adapter.map_candidate(parsed, run_id=uuid4(), seen_at=seen_at)
    assert candidate.source_posting_id == "abc"
    signal = adapter.lifecycle_signal(parsed, seen_at=seen_at)
    assert signal.last_seen_at == seen_at


def test_parse_record_rejects_malformed() -> None:
    adapter = _FakeAdapter(Settings())
    with pytest.raises(RecordValidationError):
        adapter.parse_record({"title": "no id"})
