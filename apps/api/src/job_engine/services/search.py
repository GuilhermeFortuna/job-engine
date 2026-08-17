"""PostgreSQL-backed V1 search over persisted job groups.

Free-text `q` uses `ILIKE` substring matching on title, company, description,
and technology terms. Matching is case-insensitive and accent-sensitive; no
`unaccent` extension is used. `%`, `_`, and `\\` in `q` are escaped so they
are treated as literals. Blank `q` is ignored.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from decimal import Decimal
from uuid import UUID

from fastapi.exceptions import RequestValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.api.schemas import (
    CatalogFilters,
    CatalogHealth,
    Compensation,
    FilterOption,
    JobCardBase,
    JobDetail,
    JobListItem,
    JobSearchQuery,
    JobSearchResponse,
    LatestRunStatus,
    LocationEligibility,
    LocationEligibilityRegionItem,
    RoleFamilyOption,
    SourceHealth,
    SourceOption,
    SourcePostingDetail,
    SourceSummary,
    Technology,
    canonical_technology_terms,
)
from job_engine.config import Settings
from job_engine.db import models as orm
from job_engine.db.repositories import (
    CatalogRepository,
    JobGroupApiRecord,
    JobSearchCriteria,
    LinkedSourcePosting,
)
from job_engine.domain.enums import (
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.taxonomy import REQUIRED_ROLE_FAMILY_IDS

EXCERPT_LIMIT = 280
POSTED_WITHIN_DELTAS = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
}
ROLE_FAMILY_LABELS = {
    "software_developer": "Software developer",
    "full_stack": "Full stack",
    "backend": "Backend",
    "python": "Python",
    "frontend": "Frontend",
    "ai_application": "AI application",
    "applied_ai": "Applied AI",
}
REMOTE_STATUS_LABELS = {
    RemoteStatus.REMOTE: "Remote",
    RemoteStatus.HYBRID: "Hybrid",
    RemoteStatus.ONSITE: "On-site",
    RemoteStatus.UNKNOWN: "Unknown",
}
LOCATION_ELIGIBILITY_LABELS = {
    "brazil": "Brazil",
    "latin_america": "Latin America",
    "worldwide": "Worldwide",
    "unknown": "Unknown",
}
SENIORITY_LABELS = {
    Seniority.INTERNSHIP: "Internship",
    Seniority.JUNIOR: "Junior",
    Seniority.MID: "Mid",
    Seniority.SENIOR: "Senior",
    Seniority.LEAD_STAFF: "Lead/staff",
    Seniority.UNKNOWN: "Unknown",
}
POSTED_WITHIN_LABELS = {
    "24h": "Past 24 hours",
    "7d": "Past 7 days",
    "30d": "Past 30 days",
    "any": "Any time",
}
SORT_LABELS = {
    "newest": "Newest",
    "compensation_desc": "Compensation (high to low)",
}
SOURCE_LABELS = {
    "himalayas": "Himalayas",
    "jobicy": "Jobicy",
    "remoteok": "Remote OK",
}


class SearchService:
    def __init__(self, session: AsyncSession | None, settings: Settings) -> None:
        self._settings = settings
        self._session = session

    @property
    def _repo(self) -> CatalogRepository:
        if self._session is None:
            raise RuntimeError("database session required")
        return CatalogRepository(self._session)

    async def search(self, params: JobSearchQuery) -> JobSearchResponse:
        _reject_unknown_sources(params.source, self._settings.enabled_sources)
        criteria = _criteria_from_params(params)
        records, total = await self._repo.search_job_groups(criteria)
        return JobSearchResponse(
            items=tuple(_list_item(record) for record in records),
            page=params.page,
            page_size=params.page_size,
            total=total,
            total_pages=_total_pages(total, params.page_size),
        )

    async def get_details(self, group_id: UUID) -> JobDetail | None:
        record = await self._repo.get_job_group_api_record(group_id)
        if record is None:
            return None
        return _detail(record)

    def filters(self) -> CatalogFilters:
        return CatalogFilters(
            role_families=tuple(
                RoleFamilyOption(id=family_id, label=ROLE_FAMILY_LABELS[family_id])
                for family_id in REQUIRED_ROLE_FAMILY_IDS
            ),
            technologies=tuple(
                FilterOption(value=term, label=term)
                for term in canonical_technology_terms()
            ),
            remote_status=tuple(
                FilterOption(value=status.value, label=REMOTE_STATUS_LABELS[status])
                for status in RemoteStatus
            ),
            location_eligibility=tuple(
                FilterOption(value=value, label=label)
                for value, label in LOCATION_ELIGIBILITY_LABELS.items()
            ),
            seniority=tuple(
                FilterOption(value=status.value, label=SENIORITY_LABELS[status])
                for status in Seniority
            ),
            posted_within=tuple(
                FilterOption(value=value, label=label)
                for value, label in POSTED_WITHIN_LABELS.items()
            ),
            sort=tuple(
                FilterOption(value=value, label=label)
                for value, label in SORT_LABELS.items()
            ),
            sources=tuple(
                SourceOption(id=source_id, label=source_label(source_id))
                for source_id in self._settings.enabled_sources
            ),
        )

    async def health(self) -> CatalogHealth:
        enabled = self._settings.enabled_sources
        latest = await self._repo.latest_ingestion_runs(enabled)
        catalog_last_seen_at = await self._repo.catalog_last_seen_at()
        return CatalogHealth(
            catalog_last_seen_at=catalog_last_seen_at,
            sources=tuple(
                _source_health(source_id, latest.get(source_id))
                for source_id in enabled
            ),
        )


def description_excerpt(description: str | None) -> str | None:
    if description is None:
        return None
    stripped = description.strip()
    if not stripped:
        return None
    if len(stripped) <= EXCERPT_LIMIT:
        return stripped
    window = stripped[:EXCERPT_LIMIT]
    break_at = window.rfind(" ")
    if break_at > 0:
        window = window[:break_at]
    return f"{window}..."


def escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def posted_after(posted_within: str, *, now: datetime | None = None) -> datetime | None:
    if posted_within == "any":
        return None
    moment = now if now is not None else datetime.now(UTC)
    return moment - POSTED_WITHIN_DELTAS[posted_within]


def compensation_matches(
    annual_min: Decimal | None,
    annual_max: Decimal | None,
    *,
    minimum_annual_usd: Decimal | None,
    include_unknown: bool,
) -> bool:
    if minimum_annual_usd is None:
        return True
    known = annual_min if annual_min is not None else annual_max
    if known is None:
        return include_unknown
    return known >= minimum_annual_usd


def source_label(source_id: str) -> str:
    return SOURCE_LABELS.get(source_id, source_id)


def _criteria_from_params(params: JobSearchQuery) -> JobSearchCriteria:
    return JobSearchCriteria(
        q=params.q,
        role_families=tuple(params.role_family),
        technologies=tuple(params.technology),
        remote_statuses=tuple(params.remote_status),
        location_eligibilities=tuple(
            item.value for item in params.location_eligibility
        ),
        seniorities=tuple(params.seniority),
        sources=tuple(params.source),
        minimum_annual_usd=params.minimum_annual_usd,
        include_unknown_compensation=params.include_unknown_compensation,
        posted_after=posted_after(params.posted_within),
        sort=params.sort,
        offset=(params.page - 1) * params.page_size,
        limit=params.page_size,
    )


def _reject_unknown_sources(sources: list[str], enabled: tuple[str, ...]) -> None:
    allowed = set(enabled)
    for source in sources:
        if source not in allowed:
            raise RequestValidationError(
                [
                    {
                        "type": "enum",
                        "loc": ("query", "source"),
                        "msg": "Input should be an enabled source id",
                        "input": source,
                        "ctx": {"expected": list(enabled)},
                    }
                ]
            )


def _total_pages(total: int, page_size: int) -> int:
    if total == 0:
        return 0
    return (total + page_size - 1) // page_size


def _list_item(record: JobGroupApiRecord) -> JobListItem:
    payload = _card(record).model_dump()
    payload["description_excerpt"] = description_excerpt(record.row.description)
    return JobListItem.model_validate(payload)


def _detail(record: JobGroupApiRecord) -> JobDetail:
    payload = _card(record).model_dump()
    payload["description"] = record.row.description
    payload["status"] = record.row.status
    payload["closed_at"] = record.row.closed_at
    payload["source_postings"] = tuple(
        _source_posting_detail(link) for link in record.links
    )
    return JobDetail.model_validate(payload)


def _card(record: JobGroupApiRecord) -> JobCardBase:
    row = record.row
    sources = tuple(_source_summary(link) for link in record.links)
    primary = sources[0].application_url if sources else None
    return JobCardBase(
        id=row.id,
        title=row.title,
        title_original=row.title_original,
        company=row.company,
        company_original=row.company_original,
        location_original=row.location_original,
        location_normalized_country=row.location_normalized_country,
        location_normalized_region=row.location_normalized_region,
        remote_status=row.remote_status,
        location_eligibility=_location_eligibility(row),
        seniority=row.seniority,
        seniority_original=row.seniority_original,
        employment_type=row.employment_type,
        compensation=_compensation(row),
        technologies=_technologies(row),
        role_families=_role_families(row),
        published_at=row.published_at,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
        sources=sources,
        primary_application_url=primary,
    )


def _location_eligibility(row: orm.JobGroup) -> LocationEligibility:
    by_region = {
        LocationEligibilityRegion(item.region): item.evidence_text
        for item in row.eligible_locations
    }
    regions = tuple(
        LocationEligibilityRegionItem(region=region, evidence_text=by_region[region])
        for region in LocationEligibilityRegion
        if region in by_region
    )
    return LocationEligibility(
        unknown=row.location_eligibility_unknown, regions=regions
    )


def _compensation(row: orm.CompensationMixin) -> Compensation:
    return Compensation(
        original_text=row.compensation_original_text,
        currency=row.compensation_currency,
        period=row.compensation_period,
        minimum=row.compensation_minimum,
        maximum=row.compensation_maximum,
        annual_usd_minimum=row.compensation_annual_usd_minimum,
        annual_usd_maximum=row.compensation_annual_usd_maximum,
    )


def _technologies(row: orm.JobGroup) -> tuple[Technology, ...]:
    ordered = sorted(
        row.technologies,
        key=lambda item: (item.term.casefold(), item.term, item.source_text or ""),
    )
    return tuple(
        Technology(term=item.term, source_text=item.source_text) for item in ordered
    )


def _role_families(row: orm.JobGroup) -> tuple[str, ...]:
    present = {item.family_id for item in row.role_families}
    return tuple(
        family_id for family_id in REQUIRED_ROLE_FAMILY_IDS if family_id in present
    )


def _source_summary(link: LinkedSourcePosting) -> SourceSummary:
    return SourceSummary(
        source_id=link.row.source_id,
        source_name=link.row.source_name,
        application_url=link.row.application_url,
    )


def _source_posting_detail(link: LinkedSourcePosting) -> SourcePostingDetail:
    row = link.row
    return SourcePostingDetail(
        id=row.id,
        source_id=row.source_id,
        source_posting_id=row.source_posting_id,
        source_name=row.source_name,
        application_url=row.application_url,
        title_original=row.title_original,
        company_original=row.company_original,
        description=row.description,
        location_original=row.location_original,
        remote_status=row.remote_status,
        employment_type=row.employment_type,
        seniority=row.seniority,
        seniority_original=row.seniority_original,
        compensation=_compensation(row),
        technologies_original_text=row.technologies_original_text,
        location_eligibility_evidence=row.location_eligibility_evidence,
        published_at=row.published_at,
        source_timestamp=row.source_timestamp,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
        closed_at=row.closed_at,
        status=row.status,
        adapter_version=row.adapter_version,
        linked_at=link.linked_at,
    )


def _source_health(source_id: str, run: orm.IngestionRun | None) -> SourceHealth:
    if run is None:
        return SourceHealth(
            source_id=source_id,
            latest_run_status=LatestRunStatus.NEVER_RUN,
            latest_run_started_at=None,
            latest_run_completed_at=None,
            fetched_count=None,
            accepted_count=None,
            rejected_count=None,
        )
    return SourceHealth(
        source_id=source_id,
        latest_run_status=LatestRunStatus(run.status.value),
        latest_run_started_at=run.started_at,
        latest_run_completed_at=run.completed_at,
        fetched_count=run.fetched_count,
        accepted_count=run.accepted_count,
        rejected_count=run.rejected_count,
    )
