"""Greenhouse ATS adapter tests (BACK-016)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any
from uuid import uuid4

import httpx
import pytest

from job_engine.config import Settings
from job_engine.domain.enums import JobStatus
from job_engine.sources.ats_register import GreenhouseBoard, load_approved_register
from job_engine.sources.base import PageCursor, RecordValidationError
from job_engine.sources.greenhouse import GreenhouseAdapter

SEEN_AT = datetime(2026, 8, 21, 12, 0, tzinfo=UTC)


def _settings(**overrides: object) -> Settings:
    payload: dict[str, object] = {
        "greenhouse_max_retries": 1,
        "ats_discovery_user_agent": "test-agent",
    }
    payload.update(overrides)
    return Settings.model_validate(payload)


def _client(handler: Any) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def _register_with_boards(*tokens: str) -> Any:
    base = load_approved_register()
    boards = tuple(
        GreenhouseBoard(
            id=f"greenhouse:{token}",
            employer=token.title(),
            board_token=token,
            hosted_board_url=f"https://job-boards.greenhouse.io/{token}",
        )
        for token in tokens
    )
    return base.model_copy(
        update={
            "greenhouse": base.greenhouse.model_copy(update={"approved_boards": boards})
        }
    )


def _job(
    job_id: int, *, board: str = "khanacademy", title: str = "Engineer"
) -> dict[str, Any]:
    return {
        "id": job_id,
        "title": title,
        "absolute_url": f"https://job-boards.greenhouse.io/{board}/jobs/{job_id}",
        "updated_at": "2026-08-20T10:00:00Z",
        "location": {"name": "Remote"},
        "departments": [{"name": "Engineering"}],
        "content": "<p>Build&nbsp;APIs</p>",
        "_board_token": board,
        "_employer": "Khan Academy",
        "_board_id": f"greenhouse:{board}",
    }


async def test_fetch_iterates_approved_boards_and_paginates() -> None:
    requests: list[str] = []
    register = _register_with_boards("board_a", "board_b")

    def handler(request: httpx.Request) -> httpx.Response:
        requests.append(str(request.url))
        if "board_a" in str(request.url) and "page=2" not in str(request.url):
            return httpx.Response(
                200,
                json={"jobs": [{"id": 1, "title": "A1", "absolute_url": "https://x"}]},
                headers={
                    "Link": (
                        "<https://boards-api.greenhouse.io/v1/boards/board_a/jobs"
                        '?content=true&page=2>; rel="next"'
                    )
                },
            )
        if "board_a" in str(request.url):
            return httpx.Response(
                200,
                json={"jobs": [{"id": 2, "title": "A2", "absolute_url": "https://x"}]},
            )
        return httpx.Response(
            200,
            json={"jobs": [{"id": 3, "title": "B1", "absolute_url": "https://x"}]},
        )

    adapter = GreenhouseAdapter(
        _settings(), client=_client(handler), register_payload=register
    )
    first = await adapter.fetch_page(None)
    assert first.fetched_count == 1
    assert first.next_cursor is not None
    assert "board_a||" in first.next_cursor.window

    second = await adapter.fetch_page(first.next_cursor)
    assert second.fetched_count == 1
    assert second.next_cursor == PageCursor(window="board_b", page=1)

    third = await adapter.fetch_page(second.next_cursor)
    assert third.fetched_count == 1
    assert third.next_cursor is None
    assert len(adapter.board_errors) == 0


async def test_board_failure_is_isolated_as_partial() -> None:
    register = _register_with_boards("bad", "good")

    def handler(request: httpx.Request) -> httpx.Response:
        if "bad" in str(request.url):
            return httpx.Response(500, text="boom")
        return httpx.Response(
            200,
            json={
                "jobs": [
                    {
                        "id": 9,
                        "title": "Good Role",
                        "absolute_url": (
                            "https://job-boards.greenhouse.io/good/jobs/9"
                        ),
                    }
                ]
            },
        )

    adapter = GreenhouseAdapter(
        _settings(), client=_client(handler), register_payload=register
    )
    page = await adapter.fetch_page(None)
    assert len(page.raw_records) == 1
    assert len(adapter.board_errors) == 1
    assert adapter.board_errors[0].code == "board_fetch_error"


async def test_duplicate_board_postings_are_deduped() -> None:
    register = _register_with_boards("dup")

    def handler(_request: httpx.Request) -> httpx.Response:
        job = {"id": 1, "title": "Same", "absolute_url": "https://x"}
        return httpx.Response(200, json={"jobs": [job, job]})

    adapter = GreenhouseAdapter(
        _settings(), client=_client(handler), register_payload=register
    )
    page = await adapter.fetch_page(None)
    assert page.fetched_count == 2
    assert len(page.raw_records) == 1


def test_map_candidate_builds_hosted_listing_and_html_text() -> None:
    adapter = GreenhouseAdapter(
        _settings(), register_payload=_register_with_boards("khanacademy")
    )
    parsed = adapter.parse_record(_job(4242))
    candidate = adapter.map_candidate(parsed, run_id=uuid4(), seen_at=SEEN_AT)
    assert candidate.source_id == "greenhouse"
    assert candidate.source_posting_id == "khanacademy:4242"
    assert candidate.listing_url.endswith("/khanacademy/jobs/4242")
    assert candidate.description == "Build APIs"
    assert candidate.status is JobStatus.ACTIVE


def test_parse_record_rejects_malformed() -> None:
    adapter = GreenhouseAdapter(
        _settings(), register_payload=_register_with_boards("khanacademy")
    )
    with pytest.raises(RecordValidationError):
        adapter.parse_record({"id": "x"})
