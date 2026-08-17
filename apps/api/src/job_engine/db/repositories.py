from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import exists, func, or_, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from job_engine.db import models as orm
from job_engine.domain.enums import (
    EmploymentType,
    IngestionRunStatus,
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import (
    Compensation,
    EligibleLocation,
    ErrorSummary,
    IngestionRun,
    IngestionRunCompletion,
    JobGroup,
    JobGroupInput,
    SourcePosting,
    SourcePostingInput,
    TechnologyTerm,
)


class IngestionRunNotFoundError(LookupError):
    """Raised when an ingestion run ID does not exist."""


class JobGroupNotFoundError(LookupError):
    """Raised when a job group ID does not exist."""


class SourcePostingNotFoundError(LookupError):
    """Raised when a source posting identity does not exist."""


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _compensation_columns(compensation: Compensation) -> dict[str, Any]:
    return {
        "compensation_original_text": compensation.original_text,
        "compensation_currency": compensation.currency,
        "compensation_period": compensation.period,
        "compensation_minimum": compensation.minimum,
        "compensation_maximum": compensation.maximum,
        "compensation_annual_usd_minimum": compensation.annual_usd_minimum,
        "compensation_annual_usd_maximum": compensation.annual_usd_maximum,
    }


def _compensation_from_row(row: orm.CompensationMixin) -> Compensation:
    return Compensation(
        original_text=row.compensation_original_text,
        currency=row.compensation_currency,
        period=row.compensation_period,
        minimum=row.compensation_minimum,
        maximum=row.compensation_maximum,
        annual_usd_minimum=row.compensation_annual_usd_minimum,
        annual_usd_maximum=row.compensation_annual_usd_maximum,
    )


def _error_summaries_from_row(value: list[dict[str, str]]) -> tuple[ErrorSummary, ...]:
    return tuple(
        ErrorSummary(code=item["code"], message=item["message"]) for item in value
    )


def _ingestion_run_from_row(row: orm.IngestionRun) -> IngestionRun:
    return IngestionRun(
        id=row.id,
        source_id=row.source_id,
        adapter_version=row.adapter_version,
        status=row.status,
        started_at=row.started_at,
        completed_at=row.completed_at,
        fetched_count=row.fetched_count,
        accepted_count=row.accepted_count,
        rejected_count=row.rejected_count,
        inserted_count=row.inserted_count,
        updated_count=row.updated_count,
        marked_stale_count=row.marked_stale_count,
        marked_closed_count=row.marked_closed_count,
        error_summaries=_error_summaries_from_row(row.error_summaries),
    )


def _source_posting_from_row(row: orm.SourcePosting) -> SourcePosting:
    return SourcePosting(
        id=row.id,
        source_id=row.source_id,
        source_posting_id=row.source_posting_id,
        source_name=row.source_name,
        application_url=row.application_url,
        application_url_canonical=row.application_url_canonical,
        title_original=row.title_original,
        company_original=row.company_original,
        description=row.description,
        location_original=row.location_original,
        remote_status=row.remote_status,
        employment_type=row.employment_type,
        seniority=row.seniority,
        seniority_original=row.seniority_original,
        compensation=_compensation_from_row(row),
        technologies_original_text=row.technologies_original_text,
        location_eligibility_evidence=row.location_eligibility_evidence,
        published_at=row.published_at,
        source_timestamp=row.source_timestamp,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
        closed_at=row.closed_at,
        status=row.status,
        ingestion_run_id=row.ingestion_run_id,
        adapter_version=row.adapter_version,
        raw_source_metadata=row.raw_source_metadata,
    )


def _job_group_from_row(
    row: orm.JobGroup, source_postings: tuple[SourcePosting, ...] = ()
) -> JobGroup:
    technologies = tuple(
        TechnologyTerm(term=item.term, source_text=item.source_text)
        for item in row.technologies
    )
    eligible_locations = tuple(
        EligibleLocation(
            region=LocationEligibilityRegion(item.region),
            evidence_text=item.evidence_text,
        )
        for item in row.eligible_locations
    )
    return JobGroup(
        id=row.id,
        title=row.title,
        title_original=row.title_original,
        title_comparison_key=row.title_comparison_key,
        company=row.company,
        company_original=row.company_original,
        company_comparison_key=row.company_comparison_key,
        description=row.description,
        location_original=row.location_original,
        location_comparison_key=row.location_comparison_key,
        location_normalized_country=row.location_normalized_country,
        location_normalized_region=row.location_normalized_region,
        remote_status=row.remote_status,
        employment_type=row.employment_type,
        seniority=row.seniority,
        seniority_original=row.seniority_original,
        compensation=_compensation_from_row(row),
        published_at=row.published_at,
        first_seen_at=row.first_seen_at,
        last_seen_at=row.last_seen_at,
        closed_at=row.closed_at,
        status=row.status,
        location_eligibility_unknown=row.location_eligibility_unknown,
        technologies=technologies,
        eligible_locations=eligible_locations,
        role_families=tuple(item.family_id for item in row.role_families),
        last_ingestion_run_id=row.last_ingestion_run_id,
        source_postings=source_postings,
    )


def _source_posting_values(
    posting: SourcePostingInput, posting_id: UUID
) -> dict[str, Any]:
    now = _utcnow()
    return {
        "id": posting_id,
        "source_id": posting.source_id,
        "source_posting_id": posting.source_posting_id,
        "source_name": posting.source_name,
        "application_url": posting.application_url,
        "application_url_canonical": posting.application_url_canonical,
        "title_original": posting.title_original,
        "company_original": posting.company_original,
        "description": posting.description,
        "location_original": posting.location_original,
        "remote_status": posting.remote_status,
        "employment_type": posting.employment_type,
        "seniority": posting.seniority,
        "seniority_original": posting.seniority_original,
        **_compensation_columns(posting.compensation),
        "technologies_original_text": posting.technologies_original_text,
        "location_eligibility_evidence": posting.location_eligibility_evidence,
        "published_at": posting.published_at,
        "source_timestamp": posting.source_timestamp,
        "first_seen_at": posting.first_seen_at,
        "last_seen_at": posting.last_seen_at,
        "closed_at": posting.closed_at,
        "status": posting.status,
        "ingestion_run_id": posting.ingestion_run_id,
        "adapter_version": posting.adapter_version,
        "raw_source_metadata": posting.raw_source_metadata,
        "created_at": now,
        "updated_at": now,
    }


def _apply_job_group_fields(row: orm.JobGroup, group: JobGroupInput) -> None:
    row.title = group.title
    row.title_original = group.title_original
    row.title_comparison_key = group.title_comparison_key
    row.company = group.company
    row.company_original = group.company_original
    row.company_comparison_key = group.company_comparison_key
    row.description = group.description
    row.location_original = group.location_original
    row.location_comparison_key = group.location_comparison_key
    row.location_normalized_country = group.location_normalized_country
    row.location_normalized_region = group.location_normalized_region
    row.remote_status = group.remote_status
    row.employment_type = group.employment_type
    row.seniority = group.seniority
    row.seniority_original = group.seniority_original
    row.compensation_original_text = group.compensation.original_text
    row.compensation_currency = group.compensation.currency
    row.compensation_period = group.compensation.period
    row.compensation_minimum = group.compensation.minimum
    row.compensation_maximum = group.compensation.maximum
    row.compensation_annual_usd_minimum = group.compensation.annual_usd_minimum
    row.compensation_annual_usd_maximum = group.compensation.annual_usd_maximum
    row.published_at = group.published_at
    row.first_seen_at = group.first_seen_at
    row.last_seen_at = group.last_seen_at
    row.closed_at = group.closed_at
    row.status = group.status
    row.location_eligibility_unknown = group.location_eligibility_unknown
    row.last_ingestion_run_id = group.last_ingestion_run_id
    row.updated_at = _utcnow()


def _clear_group_children(row: orm.JobGroup) -> None:
    row.technologies.clear()
    row.eligible_locations.clear()
    row.role_families.clear()


def _append_group_children(row: orm.JobGroup, group: JobGroupInput) -> None:
    for term in group.technologies:
        row.technologies.append(
            orm.JobGroupTechnology(term=term.term, source_text=term.source_text)
        )
    for location in group.eligible_locations:
        row.eligible_locations.append(
            orm.JobGroupEligibleLocation(
                region=location.region.value, evidence_text=location.evidence_text
            )
        )
    for family_id in group.role_families:
        row.role_families.append(orm.JobGroupRoleFamily(family_id=family_id))


class CatalogRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def start_ingestion_run(
        self, source_id: str, *, adapter_version: str | None = None
    ) -> IngestionRun:
        row = orm.IngestionRun(
            source_id=source_id,
            adapter_version=adapter_version,
            status=IngestionRunStatus.RUNNING,
            started_at=_utcnow(),
            error_summaries=[],
        )
        self._session.add(row)
        await self._session.flush()
        return _ingestion_run_from_row(row)

    async def complete_ingestion_run(
        self, run_id: UUID, completion: IngestionRunCompletion
    ) -> IngestionRun:
        row = await self._session.get(orm.IngestionRun, run_id)
        if row is None:
            raise IngestionRunNotFoundError(str(run_id))
        row.status = completion.status
        row.completed_at = _utcnow()
        row.fetched_count = completion.fetched_count
        row.accepted_count = completion.accepted_count
        row.rejected_count = completion.rejected_count
        row.inserted_count = completion.inserted_count
        row.updated_count = completion.updated_count
        row.marked_stale_count = completion.marked_stale_count
        row.marked_closed_count = completion.marked_closed_count
        row.error_summaries = [
            {"code": item.code, "message": item.message}
            for item in completion.error_summaries
        ]
        row.updated_at = _utcnow()
        await self._session.flush()
        return _ingestion_run_from_row(row)

    async def upsert_source_posting(self, posting: SourcePostingInput) -> SourcePosting:
        values = _source_posting_values(posting, uuid4())
        unchanged = {
            "id",
            "source_id",
            "source_posting_id",
            "first_seen_at",
            "created_at",
        }
        update_fields = {key: values[key] for key in values if key not in unchanged}
        stmt = (
            insert(orm.SourcePosting)
            .values(values)
            .on_conflict_do_update(
                constraint="uq_source_postings_source_identity",
                set_=update_fields,
            )
        )
        await self._session.execute(stmt)
        await self._session.flush()
        loaded = await self.get_source_posting(
            posting.source_id, posting.source_posting_id
        )
        if loaded is None:
            raise RuntimeError("upsert_source_posting did not persist a row")
        return loaded

    async def create_job_group(self, group: JobGroupInput) -> JobGroup:
        row = orm.JobGroup(id=uuid4())
        _apply_job_group_fields(row, group)
        row.created_at = _utcnow()
        _append_group_children(row, group)
        self._session.add(row)
        await self._session.flush()
        return await self._require_job_group(row.id)

    async def update_job_group(self, group_id: UUID, group: JobGroupInput) -> JobGroup:
        row = await self._session.get(
            orm.JobGroup,
            group_id,
            options=(
                selectinload(orm.JobGroup.technologies),
                selectinload(orm.JobGroup.eligible_locations),
                selectinload(orm.JobGroup.role_families),
            ),
        )
        if row is None:
            raise JobGroupNotFoundError(str(group_id))
        _apply_job_group_fields(row, group)
        _clear_group_children(row)
        await self._session.flush()
        _append_group_children(row, group)
        await self._session.flush()
        return await self._require_job_group(group_id)

    async def add_posting_to_group(self, group_id: UUID, posting_id: UUID) -> None:
        existing = await self._session.scalar(
            select(orm.JobGroupPosting).where(
                orm.JobGroupPosting.source_posting_id == posting_id
            )
        )
        if existing is not None:
            return
        self._session.add(
            orm.JobGroupPosting(
                job_group_id=group_id,
                source_posting_id=posting_id,
                linked_at=_utcnow(),
            )
        )
        await self._session.flush()

    async def get_source_posting(
        self, source_id: str, source_posting_id: str
    ) -> SourcePosting | None:
        stmt = select(orm.SourcePosting).where(
            orm.SourcePosting.source_id == source_id,
            orm.SourcePosting.source_posting_id == source_posting_id,
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _source_posting_from_row(row)

    async def get_job_group(self, group_id: UUID) -> JobGroup | None:
        stmt = (
            select(orm.JobGroup)
            .where(orm.JobGroup.id == group_id)
            .options(*_job_group_load_options())
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _job_group_from_loaded_row(row)

    async def get_job_group_by_source_posting(
        self, source_id: str, source_posting_id: str
    ) -> JobGroup | None:
        posting = await self.get_source_posting(source_id, source_posting_id)
        if posting is None:
            return None
        stmt = (
            select(orm.JobGroup)
            .join(orm.JobGroupPosting)
            .where(orm.JobGroupPosting.source_posting_id == posting.id)
            .options(*_job_group_load_options())
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _job_group_from_loaded_row(row)

    async def get_job_group_by_canonical_url(
        self, canonical_url: str
    ) -> JobGroup | None:
        stmt = (
            select(orm.JobGroup)
            .join(orm.JobGroupPosting)
            .join(orm.SourcePosting)
            .where(orm.SourcePosting.application_url_canonical == canonical_url)
            .options(*_job_group_load_options())
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _job_group_from_loaded_row(row)

    async def get_job_group_by_identity_tuple(
        self,
        company_key: str,
        title_key: str,
        location_key: str,
        employment_type: EmploymentType,
    ) -> JobGroup | None:
        if not location_key:
            return None
        stmt = (
            select(orm.JobGroup)
            .where(
                orm.JobGroup.company_comparison_key == company_key,
                orm.JobGroup.title_comparison_key == title_key,
                orm.JobGroup.location_comparison_key == location_key,
            )
            .options(*_job_group_load_options())
            .execution_options(populate_existing=True)
        )
        rows = (await self._session.scalars(stmt)).unique().all()
        for row in rows:
            if _employment_compatible(row.employment_type, employment_type):
                return _job_group_from_loaded_row(row)
        return None

    async def list_source_postings(self, source_id: str) -> tuple[SourcePosting, ...]:
        stmt = select(orm.SourcePosting).where(orm.SourcePosting.source_id == source_id)
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_source_posting_from_row(row) for row in rows)

    async def list_successful_ingestion_runs(
        self, source_id: str, *, before: datetime, limit: int = 1
    ) -> tuple[IngestionRun, ...]:
        stmt = (
            select(orm.IngestionRun)
            .where(
                orm.IngestionRun.source_id == source_id,
                orm.IngestionRun.status == IngestionRunStatus.SUCCESS,
                orm.IngestionRun.started_at < before,
            )
            .order_by(orm.IngestionRun.started_at.desc())
            .limit(limit)
        )
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_ingestion_run_from_row(row) for row in rows)

    async def update_source_posting_status(
        self,
        source_id: str,
        source_posting_id: str,
        status: JobStatus,
        *,
        closed_at: datetime | None = None,
    ) -> SourcePosting:
        stmt = select(orm.SourcePosting).where(
            orm.SourcePosting.source_id == source_id,
            orm.SourcePosting.source_posting_id == source_posting_id,
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise SourcePostingNotFoundError(f"{source_id}:{source_posting_id}")
        row.status = status
        if status is JobStatus.CLOSED:
            row.closed_at = closed_at
        row.updated_at = _utcnow()
        await self._session.flush()
        loaded = await self.get_source_posting(source_id, source_posting_id)
        if loaded is None:
            raise SourcePostingNotFoundError(f"{source_id}:{source_posting_id}")
        return loaded

    async def update_job_group_lifecycle(
        self,
        group_id: UUID,
        status: JobStatus,
        *,
        closed_at: datetime | None,
    ) -> JobGroup:
        row = await self._session.get(orm.JobGroup, group_id)
        if row is None:
            raise JobGroupNotFoundError(str(group_id))
        row.status = status
        row.closed_at = closed_at
        row.updated_at = _utcnow()
        await self._session.flush()
        return await self._require_job_group(group_id)

    async def _require_job_group(self, group_id: UUID) -> JobGroup:
        loaded = await self.get_job_group(group_id)
        if loaded is None:
            raise JobGroupNotFoundError(str(group_id))
        return loaded

    async def search_job_groups(
        self, criteria: JobSearchCriteria
    ) -> tuple[tuple[JobGroupApiRecord, ...], int]:
        filtered = _apply_search_filters(select(orm.JobGroup.id), criteria)
        total = await self._session.scalar(
            _apply_search_filters(
                select(func.count()).select_from(orm.JobGroup),
                criteria,
            )
        )
        if total is None:
            total = 0
        ordered = filtered.order_by(*_search_order_by(criteria.sort))
        page_ids = (
            await self._session.scalars(
                ordered.offset(criteria.offset).limit(criteria.limit)
            )
        ).all()
        records = await self._load_api_records(tuple(page_ids))
        by_id = {record.row.id: record for record in records}
        return tuple(by_id[group_id] for group_id in page_ids), total

    async def get_job_group_api_record(
        self, group_id: UUID
    ) -> JobGroupApiRecord | None:
        records = await self._load_api_records((group_id,))
        if not records:
            return None
        return records[0]

    async def latest_ingestion_runs(
        self, source_ids: tuple[str, ...]
    ) -> dict[str, orm.IngestionRun]:
        if not source_ids:
            return {}
        stmt = (
            select(orm.IngestionRun)
            .distinct(orm.IngestionRun.source_id)
            .where(orm.IngestionRun.source_id.in_(source_ids))
            .order_by(
                orm.IngestionRun.source_id,
                orm.IngestionRun.started_at.desc(),
                orm.IngestionRun.id.asc(),
            )
        )
        rows = (await self._session.scalars(stmt)).all()
        return {row.source_id: row for row in rows}

    async def catalog_last_seen_at(self) -> datetime | None:
        value = await self._session.scalar(
            select(func.max(orm.JobGroup.last_seen_at)).where(
                orm.JobGroup.status == JobStatus.ACTIVE
            )
        )
        if value is None:
            return None
        if not isinstance(value, datetime):
            raise RuntimeError("catalog last_seen_at is not a datetime")
        return value

    async def _load_api_records(
        self, group_ids: tuple[UUID, ...]
    ) -> tuple[JobGroupApiRecord, ...]:
        if not group_ids:
            return ()
        stmt = (
            select(orm.JobGroup)
            .where(orm.JobGroup.id.in_(group_ids))
            .options(*_job_group_load_options())
            .execution_options(populate_existing=True)
        )
        rows = (await self._session.scalars(stmt)).unique().all()
        return tuple(_job_group_api_record(row) for row in rows)


def _job_group_load_options() -> tuple[Any, ...]:
    return (
        selectinload(orm.JobGroup.technologies),
        selectinload(orm.JobGroup.eligible_locations),
        selectinload(orm.JobGroup.role_families),
        selectinload(orm.JobGroup.posting_links).selectinload(
            orm.JobGroupPosting.source_posting
        ),
    )


def _employment_compatible(left: EmploymentType, right: EmploymentType) -> bool:
    if left is right:
        return True
    return left is EmploymentType.UNKNOWN or right is EmploymentType.UNKNOWN


def _job_group_from_loaded_row(row: orm.JobGroup) -> JobGroup:
    postings = tuple(
        _source_posting_from_row(link.source_posting)
        for link in sorted(row.posting_links, key=lambda item: item.linked_at)
    )
    return _job_group_from_row(row, postings)


@dataclass(frozen=True)
class LinkedSourcePosting:
    row: orm.SourcePosting
    linked_at: datetime


@dataclass(frozen=True)
class JobGroupApiRecord:
    row: orm.JobGroup
    links: tuple[LinkedSourcePosting, ...]


@dataclass(frozen=True)
class JobSearchCriteria:
    q: str | None
    role_families: tuple[str, ...]
    technologies: tuple[str, ...]
    remote_statuses: tuple[RemoteStatus, ...]
    location_eligibilities: tuple[str, ...]
    seniorities: tuple[Seniority, ...]
    sources: tuple[str, ...]
    minimum_annual_usd: Decimal | None
    include_unknown_compensation: bool
    posted_after: datetime | None
    sort: str
    offset: int
    limit: int


def _escape_ilike(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _job_group_api_record(row: orm.JobGroup) -> JobGroupApiRecord:
    links = tuple(
        LinkedSourcePosting(row=link.source_posting, linked_at=link.linked_at)
        for link in sorted(
            row.posting_links,
            key=lambda item: (item.linked_at, item.source_posting.id),
        )
    )
    return JobGroupApiRecord(row=row, links=links)


def _search_order_by(sort: str) -> tuple[Any, ...]:
    posted = func.coalesce(orm.JobGroup.published_at, orm.JobGroup.first_seen_at)
    newest = (posted.desc(), orm.JobGroup.id.asc())
    if sort == "compensation_desc":
        known = func.coalesce(
            orm.JobGroup.compensation_annual_usd_minimum,
            orm.JobGroup.compensation_annual_usd_maximum,
        )
        return (known.desc().nulls_last(), *newest)
    return newest


def _apply_search_filters(stmt: Any, criteria: JobSearchCriteria) -> Any:
    stmt = stmt.where(orm.JobGroup.status == JobStatus.ACTIVE)
    if criteria.q:
        pattern = f"%{_escape_ilike(criteria.q)}%"
        tech_match = exists(
            select(1).where(
                orm.JobGroupTechnology.job_group_id == orm.JobGroup.id,
                orm.JobGroupTechnology.term.ilike(pattern, escape="\\"),
            )
        )
        stmt = stmt.where(
            or_(
                orm.JobGroup.title.ilike(pattern, escape="\\"),
                orm.JobGroup.company.ilike(pattern, escape="\\"),
                orm.JobGroup.description.ilike(pattern, escape="\\"),
                tech_match,
            )
        )
    if criteria.role_families:
        stmt = stmt.where(
            exists(
                select(1).where(
                    orm.JobGroupRoleFamily.job_group_id == orm.JobGroup.id,
                    orm.JobGroupRoleFamily.family_id.in_(criteria.role_families),
                )
            )
        )
    if criteria.technologies:
        stmt = stmt.where(
            exists(
                select(1).where(
                    orm.JobGroupTechnology.job_group_id == orm.JobGroup.id,
                    orm.JobGroupTechnology.term.in_(criteria.technologies),
                )
            )
        )
    if criteria.remote_statuses:
        stmt = stmt.where(orm.JobGroup.remote_status.in_(criteria.remote_statuses))
    if criteria.location_eligibilities:
        clauses: list[Any] = []
        regions = [
            value for value in criteria.location_eligibilities if value != "unknown"
        ]
        if regions:
            clauses.append(
                exists(
                    select(1).where(
                        orm.JobGroupEligibleLocation.job_group_id == orm.JobGroup.id,
                        orm.JobGroupEligibleLocation.region.in_(regions),
                    )
                )
            )
        if "unknown" in criteria.location_eligibilities:
            clauses.append(orm.JobGroup.location_eligibility_unknown.is_(True))
        stmt = stmt.where(or_(*clauses))
    if criteria.seniorities:
        stmt = stmt.where(orm.JobGroup.seniority.in_(criteria.seniorities))
    if criteria.sources:
        stmt = stmt.where(
            exists(
                select(1)
                .select_from(orm.JobGroupPosting)
                .join(orm.SourcePosting)
                .where(
                    orm.JobGroupPosting.job_group_id == orm.JobGroup.id,
                    orm.SourcePosting.source_id.in_(criteria.sources),
                )
            )
        )
    known = func.coalesce(
        orm.JobGroup.compensation_annual_usd_minimum,
        orm.JobGroup.compensation_annual_usd_maximum,
    )
    has_amount = or_(
        orm.JobGroup.compensation_minimum.is_not(None),
        orm.JobGroup.compensation_maximum.is_not(None),
        orm.JobGroup.compensation_annual_usd_minimum.is_not(None),
        orm.JobGroup.compensation_annual_usd_maximum.is_not(None),
    )
    if criteria.minimum_annual_usd is not None:
        meets_minimum = known >= criteria.minimum_annual_usd
        if criteria.include_unknown_compensation:
            stmt = stmt.where(or_(meets_minimum, known.is_(None)))
        else:
            stmt = stmt.where(meets_minimum)
    elif not criteria.include_unknown_compensation:
        stmt = stmt.where(has_amount)
    if criteria.posted_after is not None:
        posted = func.coalesce(orm.JobGroup.published_at, orm.JobGroup.first_seen_at)
        stmt = stmt.where(posted >= criteria.posted_after)
    return stmt
