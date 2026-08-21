"""Greenhouse Job Board API source adapter (BACK-016)."""

from __future__ import annotations

import html
import re
from collections.abc import Mapping
from datetime import UTC, datetime
from typing import Any
from uuid import UUID

import httpx

from job_engine.config import Settings
from job_engine.domain.enums import JobStatus
from job_engine.domain.jobs import ErrorSummary
from job_engine.services.normalization import NormalizationCandidate
from job_engine.sources.ats_register import (
    APPROVED_REGISTER,
    GreenhouseBoard,
    load_approved_register,
)
from job_engine.sources.base import (
    AdapterError,
    LifecycleSignal,
    PageCursor,
    RecordValidationError,
    Sleeper,
    SourcePage,
    UpstreamSchemaError,
    default_sleeper,
    redact_text,
)
from job_engine.sources.registry import register

SOURCE_ID = "greenhouse"
ADAPTER_VERSION = "greenhouse-1"
SOURCE_NAME = "Greenhouse"
_TAG_RE = re.compile(r"<[^>]+>")
_WS_RE = re.compile(r"\s+")


def _html_to_text(value: str | None) -> str | None:
    if value is None:
        return None
    unescaped = html.unescape(value)
    stripped = _TAG_RE.sub(" ", unescaped)
    collapsed = _WS_RE.sub(" ", stripped).strip()
    return collapsed or None


def _parse_datetime(value: object) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def _board_index(boards: tuple[GreenhouseBoard, ...], token: str) -> int:
    for index, board in enumerate(boards):
        if board.board_token == token:
            return index
    raise UpstreamSchemaError(f"unknown greenhouse board token {token}")


def _parse_link_next(link_header: str | None) -> str | None:
    if not link_header:
        return None
    for part in link_header.split(","):
        segment = part.strip()
        if 'rel="next"' not in segment and "rel=next" not in segment:
            continue
        start = segment.find("<")
        end = segment.find(">")
        if start >= 0 and end > start:
            return segment[start + 1 : end]
    return None


class GreenhouseAdapter:
    source_id = SOURCE_ID
    adapter_version = ADAPTER_VERSION

    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
        sleeper: Sleeper | None = None,
        register_payload: Any | None = None,
    ) -> None:
        self._settings = settings
        self._client = client
        self._sleeper = sleeper or default_sleeper
        self._register = (
            register_payload
            if register_payload is not None
            else load_approved_register()
        )
        self._boards = self._register.greenhouse.approved_boards
        self._seen_ids: set[str] = set()
        self.board_errors: list[ErrorSummary] = []

    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            timeout = httpx.Timeout(
                connect=self._settings.greenhouse_connect_timeout_seconds,
                read=self._settings.greenhouse_read_timeout_seconds,
                write=self._settings.greenhouse_read_timeout_seconds,
                pool=self._settings.greenhouse_connect_timeout_seconds,
            )
            self._client = httpx.AsyncClient(
                timeout=timeout,
                headers={"User-Agent": self._settings.ats_discovery_user_agent},
            )
        return self._client

    def _list_url(self, board: GreenhouseBoard) -> str:
        path = self._register.greenhouse.list_path.format(board_token=board.board_token)
        return f"{self._register.greenhouse.api_base.rstrip('/')}{path}"

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        if not self._boards:
            return SourcePage(raw_records=(), next_cursor=None, fetched_count=0)

        if cursor is None:
            board_index = 0
            page_url: str | None = None
        elif "||" in cursor.window:
            token, encoded = cursor.window.split("||", 1)
            board_index = _board_index(self._boards, token)
            page_url = encoded or None
        else:
            board_index = _board_index(self._boards, cursor.window)
            page_url = None

        records: list[object] = []
        fetched = 0
        next_cursor: PageCursor | None = None

        while board_index < len(self._boards):
            board = self._boards[board_index]
            url = page_url or self._list_url(board)
            params = dict(self._register.greenhouse.query) if page_url is None else None
            try:
                client = self._http_client()
                response = await client.get(url, params=params)
                if response.status_code != 200:
                    raise AdapterError(
                        redact_text(f"HTTP {response.status_code} for {board.id}")
                    )
                payload = response.json()
                next_link = _parse_link_next(response.headers.get("Link"))
            except Exception as exc:  # noqa: BLE001 — board isolation
                self.board_errors.append(
                    ErrorSummary(
                        code="board_fetch_error",
                        message=redact_text(f"{board.id}: {exc}"),
                    )
                )
                board_index += 1
                page_url = None
                continue

            jobs = payload.get("jobs") if isinstance(payload, dict) else None
            if not isinstance(jobs, list):
                self.board_errors.append(
                    ErrorSummary(
                        code="board_schema_error",
                        message=redact_text(f"{board.id}: missing jobs array"),
                    )
                )
                board_index += 1
                page_url = None
                continue

            fetched += len(jobs)
            for job in jobs:
                if not isinstance(job, dict):
                    continue
                job_id = job.get("id")
                key = f"{board.board_token}:{job_id}"
                if key in self._seen_ids:
                    continue
                self._seen_ids.add(key)
                enriched = dict(job)
                enriched["_board_token"] = board.board_token
                enriched["_employer"] = board.employer
                enriched["_board_id"] = board.id
                records.append(enriched)

            if next_link:
                next_cursor = PageCursor(
                    window=f"{board.board_token}||{next_link}",
                    page=1,
                )
                break

            board_index += 1
            page_url = None
            if records:
                if board_index < len(self._boards):
                    next_cursor = PageCursor(
                        window=self._boards[board_index].board_token,
                        page=1,
                    )
                break

        return SourcePage(
            raw_records=tuple(records),
            next_cursor=next_cursor,
            fetched_count=fetched,
        )

    def parse_record(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise RecordValidationError("job is not an object")
        job_id = raw.get("id")
        if not isinstance(job_id, int):
            raise RecordValidationError("missing numeric id")
        title = raw.get("title")
        if not isinstance(title, str) or not title.strip():
            raise RecordValidationError("missing title")
        absolute_url = raw.get("absolute_url")
        if not isinstance(absolute_url, str) or not absolute_url.strip():
            raise RecordValidationError("missing absolute_url")
        board_token = raw.get("_board_token")
        if not isinstance(board_token, str) or not board_token.strip():
            raise RecordValidationError("missing board token")
        employer = raw.get("_employer")
        if not isinstance(employer, str) or not employer.strip():
            raise RecordValidationError("missing employer")
        return dict(raw)

    def map_candidate(
        self,
        parsed: Mapping[str, Any],
        *,
        run_id: object,
        seen_at: datetime,
    ) -> NormalizationCandidate:
        signal = self.lifecycle_signal(parsed, seen_at=seen_at)
        job_id = parsed["id"]
        board_token = str(parsed["_board_token"])
        location = parsed.get("location")
        location_name = None
        if isinstance(location, dict):
            name = location.get("name")
            if isinstance(name, str) and name.strip():
                location_name = name.strip()
        departments = parsed.get("departments")
        dept_text = None
        if isinstance(departments, list):
            names = [
                str(item.get("name")).strip()
                for item in departments
                if isinstance(item, dict)
                and isinstance(item.get("name"), str)
                and str(item.get("name")).strip()
            ]
            if names:
                dept_text = ", ".join(names)
        content = parsed.get("content")
        content_text = content if isinstance(content, str) else None
        updated_at = _parse_datetime(parsed.get("updated_at"))
        ingestion_run_id = run_id if isinstance(run_id, UUID) else None
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=f"{board_token}:{job_id}",
            source_name=SOURCE_NAME,
            listing_url=str(parsed["absolute_url"]).strip(),
            title_original=str(parsed["title"]).strip(),
            company_original=str(parsed["_employer"]).strip(),
            description=_html_to_text(content_text),
            location_original=location_name,
            remote_evidence=location_name,
            employment_type_evidence=None,
            seniority_evidence=None,
            technologies_original_text=None,
            location_eligibility_evidence=location_name,
            published_at=updated_at,
            source_timestamp=updated_at,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
            closed_at=signal.closed_at,
            status=signal.status,
            ingestion_run_id=ingestion_run_id,
            adapter_version=self.adapter_version,
            raw_source_metadata={
                "board_id": parsed.get("_board_id"),
                "board_token": board_token,
                "internal_job_id": parsed.get("internal_job_id"),
                "departments": dept_text,
            },
        )

    def lifecycle_signal(
        self, parsed: Mapping[str, Any], *, seen_at: datetime
    ) -> LifecycleSignal:
        return LifecycleSignal(last_seen_at=seen_at, status=JobStatus.ACTIVE)


register(SOURCE_ID, GreenhouseAdapter)

# Ensure register loads at import for validation
_ = APPROVED_REGISTER
