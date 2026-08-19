from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping
from datetime import datetime
from typing import Any
from unittest.mock import patch
from uuid import UUID

import pytest
from httpx import AsyncClient

from job_engine.domain.enums import JobStatus
from job_engine.services.normalization import NormalizationCandidate
from job_engine.services.sync import get_global_guard
from job_engine.sources.base import LifecycleSignal, PageCursor, SourcePage


class FakeSourceAdapter:
    def __init__(
        self,
        source_id: str,
        records: list[dict[str, Any]],
        *,
        adapter_version: str = "1.0.0",
    ) -> None:
        self.source_id = source_id
        self.adapter_version = adapter_version
        self._records = records

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
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
            application_url=f"https://{self.source_id}.example/jobs/{posting_id}",
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


@pytest.fixture(autouse=True)
async def reset_guard() -> AsyncIterator[None]:
    guard = get_global_guard()
    await guard.reset()
    yield
    await guard.reset()


def _mock_adapters() -> dict[str, Any]:
    return {
        "himalayas": FakeSourceAdapter(
            "himalayas",
            [{"id": "him-api-1", "title": "API Engineer", "company": "Acme"}],
        ),
        "jobicy": FakeSourceAdapter(
            "jobicy",
            [{"id": "job-api-1", "title": "Web Engineer", "company": "Beta"}],
        ),
        "remoteok": FakeSourceAdapter(
            "remoteok",
            [{"id": "rem-api-1", "title": "Data Engineer", "company": "Gamma"}],
        ),
    }


def _parse_sse_events(text: str) -> list[tuple[str, dict[str, Any]]]:
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


async def test_post_live_sync_streams_sse(client: AsyncClient) -> None:
    adapters = _mock_adapters()
    with patch(
        "job_engine.services.sync.get_adapter", side_effect=lambda sid, _: adapters[sid]
    ):
        response = await client.post("/api/v1/catalog/live-sync")
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")
        assert response.headers.get("cache-control") == "no-cache"

        events = _parse_sse_events(response.text)
        types = [e[0] for e in events]
        assert "sync_started" in types
        assert "source_progress" in types
        assert "source_completed" in types
        assert "sync_completed" in types

        completed_event = next(e[1] for e in events if e[0] == "sync_completed")
        assert completed_event["status"] == "success"
        assert completed_event["total_inserted"] == 3


async def test_get_live_sync_streams_sse(client: AsyncClient) -> None:
    adapters = _mock_adapters()
    with patch(
        "job_engine.services.sync.get_adapter", side_effect=lambda sid, _: adapters[sid]
    ):
        response = await client.get("/api/v1/catalog/live-sync")
        assert response.status_code == 200
        assert "text/event-stream" in response.headers.get("content-type", "")

        events = _parse_sse_events(response.text)
        types = [e[0] for e in events]
        assert "sync_started" in types
        assert "sync_completed" in types


async def test_live_sync_rate_limiting_returns_429(client: AsyncClient) -> None:
    adapters = _mock_adapters()
    with patch(
        "job_engine.services.sync.get_adapter", side_effect=lambda sid, _: adapters[sid]
    ):
        # First request succeeds
        res1 = await client.post("/api/v1/catalog/live-sync")
        assert res1.status_code == 200

        # Rapid second request is rate-limited
        res2 = await client.post("/api/v1/catalog/live-sync")
        assert res2.status_code == 429
        assert "Retry-After" in res2.headers
        assert int(res2.headers["Retry-After"]) > 0
        assert "cooldown" in res2.json()["detail"].lower()
