from __future__ import annotations

import html
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

SOURCE_ID = "jobicy"
ADAPTER_VERSION = "jobicy-1"
SOURCE_NAME = "Jobicy"
JOBS_PATH = "/api/v2/remote-jobs"
WINDOWS: tuple[tuple[str, dict[str, str]], ...] = (
    ("brazil", {"geo": "brazil"}),
    ("latam", {"geo": "latam"}),
    ("engineering", {"industry": "engineering"}),
)


def _window_index(name: str) -> int:
    for index, (window_name, _) in enumerate(WINDOWS):
        if window_name == name:
            return index
    raise UpstreamSchemaError(f"unknown search window {name}")


def _parse_envelope(payload: object) -> list[object]:
    if not isinstance(payload, dict):
        raise UpstreamSchemaError("response is not an object")
    if payload.get("success") is False:
        raise UpstreamSchemaError("response success is false")
    status_code = payload.get("statusCode")
    if status_code is not None and status_code != 200:
        raise UpstreamSchemaError("non-success statusCode")
    jobs = payload.get("jobs")
    if not isinstance(jobs, list):
        raise UpstreamSchemaError("missing jobs array")
    return jobs


def _next_cursor(window_index: int, max_windows: int) -> PageCursor | None:
    next_index = window_index + 1
    if next_index >= len(WINDOWS) or next_index >= max_windows:
        return None
    return PageCursor(window=WINDOWS[next_index][0], page=1)


def _parse_datetime(value: object) -> datetime | None:
    if value is None:
        return None
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


def _unescape_industry(values: object) -> str | None:
    if isinstance(values, str) and values.strip():
        return html.unescape(values.strip())
    if isinstance(values, list):
        parts = [
            html.unescape(item.strip())
            for item in values
            if isinstance(item, str) and item.strip()
        ]
        if parts:
            return ", ".join(parts)
    return None


def _job_id(raw: Mapping[str, Any]) -> int | None:
    value = raw.get("id")
    if isinstance(value, bool) or not isinstance(value, int):
        return None
    return value


def _compensation_text(
    minimum: Decimal | None,
    maximum: Decimal | None,
    currency: str | None,
    period: str | None,
) -> str | None:
    if minimum is None and maximum is None:
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


class JobicyAdapter:
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
        self._seen_ids: set[int] = set()

    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            timeout = httpx.Timeout(
                connect=self._settings.jobicy_connect_timeout_seconds,
                read=self._settings.jobicy_read_timeout_seconds,
                write=self._settings.jobicy_read_timeout_seconds,
                pool=self._settings.jobicy_connect_timeout_seconds,
            )
            self._client = httpx.AsyncClient(
                base_url=self._settings.jobicy_base_url.rstrip("/"),
                timeout=timeout,
                headers={"User-Agent": self._settings.jobicy_user_agent},
            )
        return self._client

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        if cursor is None:
            window_index = 0
        else:
            window_index = _window_index(cursor.window)
        _window_name, extra = WINDOWS[window_index]
        params = {**extra, "count": str(self._settings.jobicy_count)}
        url = f"{self._settings.jobicy_base_url.rstrip('/')}{JOBS_PATH}"
        payload = await fetch_json(
            self._http_client(),
            url,
            params=params,
            sleeper=self._sleeper,
            max_retries=self._settings.jobicy_max_retries,
        )
        jobs = _parse_envelope(payload)
        records: list[object] = []
        for job in jobs:
            if not isinstance(job, dict):
                raise UpstreamSchemaError("job is not an object")
            job_id = _job_id(job)
            if job_id is not None and job_id in self._seen_ids:
                continue
            if job_id is not None:
                self._seen_ids.add(job_id)
            records.append(job)
        return SourcePage(
            raw_records=tuple(records),
            next_cursor=_next_cursor(window_index, self._settings.jobicy_max_windows),
            fetched_count=len(jobs),
        )

    def parse_record(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise RecordValidationError("job is not an object")
        if _job_id(raw) is None:
            raise RecordValidationError("missing id")
        application_url = raw.get("url")
        if not isinstance(application_url, str) or not application_url.strip():
            raise RecordValidationError("missing url")
        title = raw.get("jobTitle")
        if not isinstance(title, str) or not title.strip():
            raise RecordValidationError("missing jobTitle")
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
        job_id = _job_id(parsed)
        assert job_id is not None
        geo = parsed.get("jobGeo")
        location_original = (
            geo.strip() if isinstance(geo, str) and geo.strip() else None
        )
        level = parsed.get("jobLevel")
        seniority = None
        if (
            isinstance(level, str)
            and level.strip()
            and level.strip().casefold() != "any"
        ):
            seniority = level.strip()
        currency = parsed.get("salaryCurrency")
        currency_text = (
            currency.strip() if isinstance(currency, str) and currency.strip() else None
        )
        raw_period = parsed.get("salaryPeriod")
        period = (
            raw_period.strip()
            if isinstance(raw_period, str) and raw_period.strip()
            else None
        )
        minimum = _decimal(parsed.get("salaryMin"))
        maximum = _decimal(parsed.get("salaryMax"))
        description = parsed.get("jobDescription")
        description_text = description if isinstance(description, str) else None
        published_at = _parse_datetime(parsed.get("pubDate"))
        ingestion_run_id = run_id if isinstance(run_id, UUID) else None
        metadata = {
            "id": parsed.get("id"),
            "jobSlug": parsed.get("jobSlug"),
            "jobIndustry": parsed.get("jobIndustry"),
            "jobGeo": parsed.get("jobGeo"),
            "jobLevel": parsed.get("jobLevel"),
        }
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=str(job_id),
            source_name=SOURCE_NAME,
            application_url=str(parsed["url"]),
            title_original=str(parsed["jobTitle"]),
            company_original=str(parsed["companyName"]),
            description=description_text,
            location_original=location_original,
            remote_evidence="remote",
            employment_type_evidence=_join(parsed.get("jobType")),
            seniority_evidence=seniority,
            compensation_original_text=_compensation_text(
                minimum, maximum, currency_text, period
            ),
            compensation_currency=currency_text,
            compensation_period=period,
            compensation_minimum=minimum,
            compensation_maximum=maximum,
            technologies_original_text=_unescape_industry(parsed.get("jobIndustry")),
            location_eligibility_evidence=location_original,
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
        return LifecycleSignal(last_seen_at=seen_at, status=JobStatus.ACTIVE)


def _jobicy_factory(settings: Settings) -> JobicyAdapter:
    return JobicyAdapter(settings)


register(SOURCE_ID, _jobicy_factory)
