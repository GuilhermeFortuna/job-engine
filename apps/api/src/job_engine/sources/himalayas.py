from __future__ import annotations

import math
from collections.abc import Mapping
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

import httpx

from job_engine.config import Settings
from job_engine.domain.enums import JobStatus
from job_engine.services.normalization import NormalizationCandidate
from job_engine.sources.base import (
    LifecycleSignal,
    PageCursor,
    RecordValidationError,
    Sleeper,
    SourcePage,
    UpstreamSchemaError,
    fetch_json,
)
from job_engine.sources.registry import register

SOURCE_ID = "himalayas"
ADAPTER_VERSION = "himalayas-1"
SOURCE_NAME = "Himalayas"
SEARCH_PATH = "/jobs/api/search"
WINDOWS: tuple[tuple[str, dict[str, str]], ...] = (
    ("worldwide", {"worldwide": "true", "sort": "recent"}),
    (
        "brazil",
        {"country": "Brazil", "exclude_worldwide": "true", "sort": "recent"},
    ),
)
PERIOD_MAP = {
    "hourly": "hour",
    "hour": "hour",
    "weekly": "weekly",
    "fortnightly": "fortnightly",
    "monthly": "month",
    "month": "month",
    "annual": "year",
    "year": "year",
}


def _window_params(name: str) -> dict[str, str]:
    for window_name, params in WINDOWS:
        if window_name == name:
            return params
    raise UpstreamSchemaError(f"unknown search window {name}")


def _window_index(name: str) -> int:
    for index, (window_name, _) in enumerate(WINDOWS):
        if window_name == name:
            return index
    raise UpstreamSchemaError(f"unknown search window {name}")


def _parse_envelope(payload: object) -> tuple[list[object], int, int]:
    if not isinstance(payload, dict):
        raise UpstreamSchemaError("response is not an object")
    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        raise UpstreamSchemaError("missing jobs array")
    total_count = payload.get("totalCount", 0)
    limit = payload.get("limit", 20)
    if not isinstance(total_count, int) or total_count < 0:
        raise UpstreamSchemaError("invalid totalCount")
    if not isinstance(limit, int) or limit < 1:
        raise UpstreamSchemaError("invalid limit")
    return jobs, total_count, limit


def _next_cursor(
    window_index: int,
    page: int,
    total_count: int,
    limit: int,
    max_pages: int,
) -> PageCursor | None:
    total_pages = math.ceil(total_count / limit) if total_count else 0
    if total_pages > 0 and page < total_pages and page < max_pages:
        return PageCursor(window=WINDOWS[window_index][0], page=page + 1)
    if window_index + 1 < len(WINDOWS):
        return PageCursor(window=WINDOWS[window_index + 1][0], page=1)
    return None


def _restriction_names(value: object) -> tuple[str, ...]:
    if not isinstance(value, list) or not value:
        return ()
    names: list[str] = []
    for item in value:
        if isinstance(item, str) and item.strip():
            names.append(item.strip())
        elif isinstance(item, dict):
            name = item.get("name") or item.get("slug")
            if isinstance(name, str) and name.strip():
                names.append(name.strip())
    return tuple(names)


def _parse_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, int | float):
        timestamp = float(value)
        if timestamp > 1e12:
            timestamp /= 1000
        return datetime.fromtimestamp(timestamp, UTC)
    if isinstance(value, str) and value.strip():
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    return None


def _decimal(value: object) -> Decimal | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, int | float | Decimal | str):
        try:
            return Decimal(str(value))
        except Exception:
            return None
    return None


def _join(values: object) -> str | None:
    if isinstance(values, str) and values.strip():
        return values.strip()
    if isinstance(values, list):
        parts = [
            item.strip() for item in values if isinstance(item, str) and item.strip()
        ]
        if parts:
            return ", ".join(parts)
    return None


def _compensation_text(
    minimum: Decimal | None,
    maximum: Decimal | None,
    currency: str | None,
    period: str | None,
) -> str | None:
    if minimum is None and maximum is None and currency is None and period is None:
        return None
    amount = ""
    if minimum is not None and maximum is not None:
        amount = f"{minimum}-{maximum}"
    elif minimum is not None:
        amount = str(minimum)
    elif maximum is not None:
        amount = str(maximum)
    parts = [part for part in (currency, amount, period) if part]
    return " ".join(parts) or None


class HimalayasAdapter:
    source_id = SOURCE_ID
    adapter_version = ADAPTER_VERSION

    def __init__(
        self,
        settings: Settings,
        *,
        client: httpx.AsyncClient | None = None,
        sleeper: Sleeper | None = None,
    ) -> None:
        self._settings = settings
        self._client = client
        self._sleeper = sleeper
        self._seen_guids: set[str] = set()

    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            timeout = httpx.Timeout(
                connect=self._settings.himalayas_connect_timeout_seconds,
                read=self._settings.himalayas_read_timeout_seconds,
                write=self._settings.himalayas_read_timeout_seconds,
                pool=self._settings.himalayas_connect_timeout_seconds,
            )
            self._client = httpx.AsyncClient(
                base_url=self._settings.himalayas_base_url.rstrip("/"),
                timeout=timeout,
                headers={"User-Agent": self._settings.himalayas_user_agent},
            )
        return self._client

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        if cursor is None:
            window_index = 0
            page = 1
        else:
            window_index = _window_index(cursor.window)
            page = cursor.page
        _window_name, extra = WINDOWS[window_index]
        params = {**extra, "page": str(page)}
        url = f"{self._settings.himalayas_base_url.rstrip('/')}{SEARCH_PATH}"
        payload = await fetch_json(
            self._http_client(),
            url,
            params=params,
            sleeper=self._sleeper,
            max_retries=self._settings.himalayas_max_retries,
        )
        jobs, total_count, limit = _parse_envelope(payload)
        records: list[object] = []
        for job in jobs:
            if not isinstance(job, dict):
                raise UpstreamSchemaError("job is not an object")
            guid = job.get("guid")
            if isinstance(guid, str) and guid in self._seen_guids:
                continue
            if isinstance(guid, str) and guid:
                self._seen_guids.add(guid)
            records.append(job)
        return SourcePage(
            raw_records=tuple(records),
            next_cursor=_next_cursor(
                window_index,
                page,
                total_count,
                limit,
                self._settings.himalayas_max_pages_per_window,
            ),
            fetched_count=len(jobs),
        )

    def parse_record(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise RecordValidationError("job is not an object")
        guid = raw.get("guid")
        if not isinstance(guid, str) or not guid.strip():
            raise RecordValidationError("missing guid")
        application_link = raw.get("applicationLink")
        if not isinstance(application_link, str) or not application_link.strip():
            raise RecordValidationError("missing applicationLink")
        title = raw.get("title")
        if not isinstance(title, str) or not title.strip():
            raise RecordValidationError("missing title")
        company = raw.get("companyName")
        if not isinstance(company, str) or not company.strip():
            raise RecordValidationError("missing companyName")
        return dict(raw)

    def map_candidate(
        self,
        parsed: Mapping[str, Any],
        *,
        run_id: object,
        seen_at: datetime,
    ) -> NormalizationCandidate:
        signal = self.lifecycle_signal(parsed, seen_at=seen_at)
        names = _restriction_names(parsed.get("locationRestrictions"))
        location_original = ", ".join(names) if names else "Worldwide"
        eligibility = "worldwide" if not names else ", ".join(names)
        currency = parsed.get("currency")
        currency_text = (
            currency.strip() if isinstance(currency, str) and currency.strip() else None
        )
        raw_period = parsed.get("salaryPeriod")
        period = None
        if isinstance(raw_period, str) and raw_period.strip():
            period = PERIOD_MAP.get(raw_period.casefold(), raw_period.strip())
        minimum = _decimal(parsed.get("minSalary"))
        maximum = _decimal(parsed.get("maxSalary"))
        description = parsed.get("description")
        description_text = description if isinstance(description, str) else None
        categories = parsed.get("categories")
        published_at = _parse_datetime(parsed.get("pubDate"))
        ingestion_run_id = run_id if isinstance(run_id, UUID) else None
        metadata = {
            "guid": parsed.get("guid"),
            "companySlug": parsed.get("companySlug"),
            "expiryDate": parsed.get("expiryDate"),
            "categories": parsed.get("categories"),
        }
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=str(parsed["guid"]),
            source_name=SOURCE_NAME,
            application_url=str(parsed["applicationLink"]),
            title_original=str(parsed["title"]),
            company_original=str(parsed["companyName"]),
            description=description_text,
            location_original=location_original,
            remote_evidence="remote",
            employment_type_evidence=_join(parsed.get("employmentType")),
            seniority_evidence=_join(parsed.get("seniority")),
            compensation_original_text=_compensation_text(
                minimum, maximum, currency_text, period
            ),
            compensation_currency=currency_text,
            compensation_period=period,
            compensation_minimum=minimum,
            compensation_maximum=maximum,
            technologies_original_text=_join(categories),
            location_eligibility_evidence=eligibility,
            published_at=published_at,
            source_timestamp=published_at,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
            closed_at=signal.closed_at,
            status=signal.status,
            ingestion_run_id=ingestion_run_id,
            adapter_version=self.adapter_version,
            raw_source_metadata=metadata,
        )

    def lifecycle_signal(
        self, parsed: Mapping[str, Any], *, seen_at: datetime
    ) -> LifecycleSignal:
        expiry = _parse_datetime(parsed.get("expiryDate"))
        if expiry is not None and expiry <= seen_at:
            return LifecycleSignal(
                last_seen_at=seen_at, closed_at=expiry, status=JobStatus.CLOSED
            )
        return LifecycleSignal(last_seen_at=seen_at, status=JobStatus.ACTIVE)


def _himalayas_factory(settings: Settings) -> HimalayasAdapter:
    return HimalayasAdapter(settings)


register(SOURCE_ID, _himalayas_factory)
