from __future__ import annotations

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

SOURCE_ID = "remoteok"
ADAPTER_VERSION = "remoteok-1"
SOURCE_NAME = "Remote OK"
JOBS_PATH = "/api"


def _is_legal_object(item: Mapping[str, Any]) -> bool:
    return "legal" in item


def _parse_envelope(payload: object) -> list[object]:
    if not isinstance(payload, list):
        raise UpstreamSchemaError("response is not an array")
    records = list(payload)
    if records and isinstance(records[0], dict) and _is_legal_object(records[0]):
        records = records[1:]
    for item in records:
        if not isinstance(item, dict):
            raise UpstreamSchemaError("job is not an object")
    return records


def _job_id(raw: Mapping[str, Any]) -> str | None:
    value = raw.get("id")
    if isinstance(value, bool):
        return None
    if isinstance(value, int):
        return str(value)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _application_url(raw: Mapping[str, Any]) -> str | None:
    for key in ("url", "apply_url"):
        value = raw.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def _parse_datetime(value: object) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, int | float) and not isinstance(value, bool):
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
            amount = Decimal(str(value))
        except Exception:
            return None
        if amount == 0:
            return None
        return amount
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


def _optional_text(value: object) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def _compensation_text(
    minimum: Decimal | None,
    maximum: Decimal | None,
) -> str | None:
    if minimum is None and maximum is None:
        return None
    if minimum is not None and maximum is not None:
        return f"{minimum}-{maximum}"
    if minimum is not None:
        return str(minimum)
    return str(maximum)


class RemoteokAdapter:
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
        self._seen_ids: set[str] = set()

    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            timeout = httpx.Timeout(
                connect=self._settings.remoteok_connect_timeout_seconds,
                read=self._settings.remoteok_read_timeout_seconds,
                write=self._settings.remoteok_read_timeout_seconds,
                pool=self._settings.remoteok_connect_timeout_seconds,
            )
            self._client = httpx.AsyncClient(
                base_url=self._settings.remoteok_base_url.rstrip("/"),
                timeout=timeout,
                headers={"User-Agent": self._settings.remoteok_user_agent},
            )
        return self._client

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        if cursor is not None:
            raise UpstreamSchemaError("unexpected cursor")
        url = f"{self._settings.remoteok_base_url.rstrip('/')}{JOBS_PATH}"
        payload = await fetch_json(
            self._http_client(),
            url,
            sleeper=self._sleeper,
            max_retries=self._settings.remoteok_max_retries,
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
            next_cursor=None,
            fetched_count=len(jobs),
        )

    def parse_record(self, raw: object) -> dict[str, Any]:
        if not isinstance(raw, dict):
            raise RecordValidationError("job is not an object")
        if _job_id(raw) is None:
            raise RecordValidationError("missing id")
        if _application_url(raw) is None:
            raise RecordValidationError("missing url")
        title = raw.get("position")
        if not isinstance(title, str) or not title.strip():
            raise RecordValidationError("missing position")
        company = raw.get("company")
        if not isinstance(company, str) or not company.strip():
            raise RecordValidationError("missing company")
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
        listing_url = _application_url(parsed)
        assert job_id is not None
        assert listing_url is not None
        location_original = _optional_text(parsed.get("location"))
        description = parsed.get("description")
        description_text = description if isinstance(description, str) else None
        published_at = _parse_datetime(parsed.get("epoch")) or _parse_datetime(
            parsed.get("date")
        )
        minimum = _decimal(parsed.get("salary_min"))
        maximum = _decimal(parsed.get("salary_max"))
        ingestion_run_id = run_id if isinstance(run_id, UUID) else None
        metadata = {
            "id": parsed.get("id"),
            "slug": parsed.get("slug"),
            "tags": parsed.get("tags"),
            "location": parsed.get("location"),
        }
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=job_id,
            source_name=SOURCE_NAME,
            listing_url=listing_url,
            title_original=str(parsed["position"]),
            company_original=str(parsed["company"]),
            description=description_text,
            location_original=location_original,
            remote_evidence="remote",
            employment_type_evidence=None,
            seniority_evidence=None,
            compensation_original_text=_compensation_text(minimum, maximum),
            compensation_currency=None,
            compensation_period=None,
            compensation_minimum=minimum,
            compensation_maximum=maximum,
            technologies_original_text=_join(parsed.get("tags")),
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


def _remoteok_factory(settings: Settings) -> RemoteokAdapter:
    return RemoteokAdapter(settings)


register(SOURCE_ID, _remoteok_factory)
