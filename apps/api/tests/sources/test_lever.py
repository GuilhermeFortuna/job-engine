"""Lever ATS adapter tests (BACK-016)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx
import pytest

from job_engine.config import Settings
from job_engine.domain.enums import JobStatus
from job_engine.sources.ats_register import LeverSite, load_approved_register
from job_engine.sources.base import PageCursor, RecordValidationError
from job_engine.sources.lever import LeverAdapter

SEEN_AT = datetime(2026, 8, 21, 12, 0, tzinfo=UTC)


async def _noop_sleep(_seconds: float) -> None:
    return None


def _settings(**overrides: object) -> Settings:
    payload: dict[str, object] = {
        "lever_max_retries": 1,
        "ats_discovery_user_agent": "test-agent",
    }
    payload.update(overrides)
    return Settings.model_validate(payload)


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _register_with_sites(*sites: str) -> Any:
    base = load_approved_register()
    approved = tuple(
        LeverSite(
            id=f"lever:{site}",
            employer=site.title(),
            site=site,
            region="global",
            hosted_site_url=f"https://jobs.lever.co/{site}",
        )
        for site in sites
    )
    return base.model_copy(
        update={
            "lever": base.lever.model_copy(
                update={
                    "approved_sites": approved,
                    "crawl_delay_seconds": 0.0,
                    "pagination": {"skip": True, "limit": 2},
                }
            )
        }
    )


def _posting(
    posting_id: str,
    *,
    site: str = "ro",
    title: str = "Engineer",
) -> dict[str, Any]:
    return {
        "id": posting_id,
        "text": title,
        "applyUrl": f"https://jobs.lever.co/{site}/{posting_id}/apply",
        "hostedUrl": f"https://jobs.lever.co/{site}/{posting_id}",
        "createdAt": 1724227200000,
        "categories": {
            "location": "Remote",
            "commitment": "Full-time",
            "team": "Engineering",
        },
        "descriptionPlain": "Build systems",
        "_site": site,
        "_employer": "Ro",
        "_site_id": f"lever:{site}",
        "_region": "global",
    }


async def test_fetch_paginates_within_site_then_advances() -> None:
    register = _register_with_sites("site_a", "site_b")
    calls: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        calls.append(str(request.url))
        query = dict(request.url.params)
        site = str(request.url).split("/postings/")[1].split("?")[0]
        skip = int(query.get("skip", "0"))
        if site == "site_a" and skip == 0:
            return httpx.Response(
                200,
                json=[
                    {"id": "a1", "text": "A1", "applyUrl": "https://x/a1/apply"},
                    {"id": "a2", "text": "A2", "applyUrl": "https://x/a2/apply"},
                ],
            )
        if site == "site_a":
            return httpx.Response(
                200,
                json=[{"id": "a3", "text": "A3", "applyUrl": "https://x/a3/apply"}],
            )
        return httpx.Response(
            200,
            json=[{"id": "b1", "text": "B1", "applyUrl": "https://x/b1/apply"}],
        )

    adapter = LeverAdapter(
        _settings(),
        client=_client(handler),
        sleeper=_noop_sleep,
        register_payload=register,
    )
    first = await adapter.fetch_page(None)
    assert first.fetched_count == 2
    assert first.next_cursor == PageCursor(window="site_a", page=2)

    second = await adapter.fetch_page(first.next_cursor)
    assert second.fetched_count == 1
    assert second.next_cursor == PageCursor(window="site_b", page=1)

    third = await adapter.fetch_page(second.next_cursor)
    assert third.fetched_count == 1
    assert third.next_cursor is None


async def test_site_failure_is_isolated() -> None:
    register = _register_with_sites("bad", "good")

    def handler(request: httpx.Request) -> httpx.Response:
        if "/postings/bad" in str(request.url):
            return httpx.Response(503, text="down")
        return httpx.Response(
            200,
            json=[
                {
                    "id": "ok-1",
                    "text": "Good Role",
                    "applyUrl": "https://jobs.lever.co/good/ok-1/apply",
                }
            ],
        )

    adapter = LeverAdapter(
        _settings(),
        client=_client(handler),
        sleeper=_noop_sleep,
        register_payload=register,
    )
    page = await adapter.fetch_page(None)
    assert len(page.raw_records) == 1
    assert len(adapter.board_errors) == 1


async def test_duplicate_site_postings_are_deduped() -> None:
    register = _register_with_sites("dup")

    def handler(_request: httpx.Request) -> httpx.Response:
        item = {"id": "same", "text": "Same", "applyUrl": "https://x/same/apply"}
        return httpx.Response(200, json=[item, item])

    adapter = LeverAdapter(
        _settings(),
        client=_client(handler),
        sleeper=_noop_sleep,
        register_payload=register,
    )
    page = await adapter.fetch_page(None)
    assert page.fetched_count == 2
    assert len(page.raw_records) == 1


def test_map_candidate_uses_apply_url_as_listing() -> None:
    adapter = LeverAdapter(
        _settings(),
        sleeper=_noop_sleep,
        register_payload=_register_with_sites("ro"),
    )
    parsed = adapter.parse_record(_posting("abc-123"))
    candidate = adapter.map_candidate(parsed, run_id=uuid4(), seen_at=SEEN_AT)
    assert candidate.source_id == "lever"
    assert candidate.source_posting_id == "ro:abc-123"
    assert candidate.listing_url.endswith("/ro/abc-123/apply")
    assert candidate.description == "Build systems"
    assert candidate.status is JobStatus.ACTIVE


def test_parse_record_rejects_malformed() -> None:
    adapter = LeverAdapter(
        _settings(),
        sleeper=_noop_sleep,
        register_payload=_register_with_sites("ro"),
    )
    with pytest.raises(RecordValidationError):
        adapter.parse_record({"id": 1})
