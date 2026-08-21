"""Lever Postings API source adapter (BACK-016)."""

from __future__ import annotations

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
    LeverSite,
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
    fetch_json,
    redact_text,
)
from job_engine.sources.registry import register

SOURCE_ID = "lever"
ADAPTER_VERSION = "lever-1"
SOURCE_NAME = "Lever"


def _parse_datetime(value: object) -> datetime | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        # Lever uses epoch milliseconds
        seconds = float(value) / 1000.0 if value > 10_000_000_000 else float(value)
        return datetime.fromtimestamp(seconds, tz=UTC)
    if isinstance(value, str) and value.strip():
        normalized = value.replace("Z", "+00:00")
        parsed = datetime.fromisoformat(normalized)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=UTC)
        return parsed.astimezone(UTC)
    return None


def _site_index(sites: tuple[LeverSite, ...], site: str) -> int:
    for index, item in enumerate(sites):
        if item.site == site:
            return index
    raise UpstreamSchemaError(f"unknown lever site {site}")


class LeverAdapter:
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
        self._sites = self._register.lever.approved_sites
        self._seen_ids: set[str] = set()
        self.board_errors: list[ErrorSummary] = []
        self._limit = int(self._register.lever.pagination.get("limit", 50))

    def _http_client(self) -> httpx.AsyncClient:
        if self._client is None:
            timeout = httpx.Timeout(
                connect=self._settings.lever_connect_timeout_seconds,
                read=self._settings.lever_read_timeout_seconds,
                write=self._settings.lever_read_timeout_seconds,
                pool=self._settings.lever_connect_timeout_seconds,
            )
            self._client = httpx.AsyncClient(
                timeout=timeout,
                headers={
                    "User-Agent": self._settings.ats_discovery_user_agent,
                    "Accept": "application/json",
                },
            )
        return self._client

    def _list_url(self, site: LeverSite) -> str:
        region = self._register.lever.regions[site.region]
        path = self._register.lever.list_path.format(site=site.site)
        return f"{region.api_base.rstrip('/')}{path}"

    async def fetch_page(self, cursor: PageCursor | None) -> SourcePage:
        if not self._sites:
            return SourcePage(raw_records=(), next_cursor=None, fetched_count=0)

        if cursor is None:
            site_index = 0
            skip = 0
        else:
            site_index = _site_index(self._sites, cursor.window)
            skip = max(cursor.page - 1, 0) * self._limit

        records: list[object] = []
        fetched = 0
        next_cursor: PageCursor | None = None

        while site_index < len(self._sites):
            site = self._sites[site_index]
            url = self._list_url(site)
            params = {
                **self._register.lever.query,
                "limit": str(self._limit),
                "skip": str(skip),
            }
            try:
                await self._sleeper(self._register.lever.crawl_delay_seconds)
                payload = await fetch_json(
                    self._http_client(),
                    url,
                    params=params,
                    sleeper=self._sleeper,
                    max_retries=self._settings.lever_max_retries,
                )
            except AdapterError as exc:
                self.board_errors.append(
                    ErrorSummary(
                        code="board_fetch_error",
                        message=redact_text(f"{site.id}: {exc}"),
                    )
                )
                site_index += 1
                skip = 0
                continue
            except Exception as exc:  # noqa: BLE001 — site isolation
                self.board_errors.append(
                    ErrorSummary(
                        code="board_fetch_error",
                        message=redact_text(f"{site.id}: {exc}"),
                    )
                )
                site_index += 1
                skip = 0
                continue

            if not isinstance(payload, list):
                self.board_errors.append(
                    ErrorSummary(
                        code="board_schema_error",
                        message=redact_text(f"{site.id}: response is not an array"),
                    )
                )
                site_index += 1
                skip = 0
                continue

            fetched += len(payload)
            for posting in payload:
                if not isinstance(posting, dict):
                    continue
                posting_id = posting.get("id")
                key = f"{site.site}:{posting_id}"
                if key in self._seen_ids:
                    continue
                self._seen_ids.add(key)
                enriched = dict(posting)
                enriched["_site"] = site.site
                enriched["_employer"] = site.employer
                enriched["_site_id"] = site.id
                enriched["_region"] = site.region
                records.append(enriched)

            if len(payload) >= self._limit:
                next_cursor = PageCursor(
                    window=site.site,
                    page=(skip // self._limit) + 2,
                )
                break

            site_index += 1
            skip = 0
            if records:
                if site_index < len(self._sites):
                    next_cursor = PageCursor(
                        window=self._sites[site_index].site,
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
            raise RecordValidationError("posting is not an object")
        posting_id = raw.get("id")
        if not isinstance(posting_id, str) or not posting_id.strip():
            raise RecordValidationError("missing id")
        text = raw.get("text")
        if not isinstance(text, str) or not text.strip():
            raise RecordValidationError("missing text")
        apply_url = raw.get("applyUrl")
        if not isinstance(apply_url, str) or not apply_url.strip():
            raise RecordValidationError("missing applyUrl")
        site = raw.get("_site")
        if not isinstance(site, str) or not site.strip():
            raise RecordValidationError("missing site")
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
        site = str(parsed["_site"])
        posting_id = str(parsed["id"])
        categories = parsed.get("categories")
        location_name = None
        commitment = None
        team = None
        if isinstance(categories, dict):
            loc = categories.get("location")
            if isinstance(loc, str) and loc.strip():
                location_name = loc.strip()
            commit = categories.get("commitment")
            if isinstance(commit, str) and commit.strip():
                commitment = commit.strip()
            team_val = categories.get("team")
            if isinstance(team_val, str) and team_val.strip():
                team = team_val.strip()
        description = parsed.get("descriptionPlain")
        if not isinstance(description, str) or not description.strip():
            description = parsed.get("description")
        description_text = (
            description.strip()
            if isinstance(description, str) and description.strip()
            else None
        )
        created_at = _parse_datetime(parsed.get("createdAt"))
        ingestion_run_id = run_id if isinstance(run_id, UUID) else None
        workplace = parsed.get("workplaceType")
        remote_evidence = (
            workplace.strip()
            if isinstance(workplace, str) and workplace.strip()
            else location_name
        )
        return NormalizationCandidate(
            source_id=self.source_id,
            source_posting_id=f"{site}:{posting_id}",
            source_name=SOURCE_NAME,
            listing_url=str(parsed["applyUrl"]).strip(),
            title_original=str(parsed["text"]).strip(),
            company_original=str(parsed["_employer"]).strip(),
            description=description_text,
            location_original=location_name,
            remote_evidence=remote_evidence,
            employment_type_evidence=commitment,
            seniority_evidence=None,
            technologies_original_text=team,
            location_eligibility_evidence=location_name,
            published_at=created_at,
            source_timestamp=created_at,
            first_seen_at=seen_at,
            last_seen_at=seen_at,
            closed_at=signal.closed_at,
            status=signal.status,
            ingestion_run_id=ingestion_run_id,
            adapter_version=self.adapter_version,
            raw_source_metadata={
                "site_id": parsed.get("_site_id"),
                "site": site,
                "region": parsed.get("_region"),
                "hosted_url": parsed.get("hostedUrl"),
                "workplace_type": workplace,
            },
        )

    def lifecycle_signal(
        self, parsed: Mapping[str, Any], *, seen_at: datetime
    ) -> LifecycleSignal:
        return LifecycleSignal(last_seen_at=seen_at, status=JobStatus.ACTIVE)


register(SOURCE_ID, LeverAdapter)
_ = APPROVED_REGISTER
