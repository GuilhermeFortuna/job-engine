from __future__ import annotations

import hmac
import secrets
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    delete,
    exists,
    func,
    or_,
    select,
    text,
    update,
)
from sqlalchemy import (
    inspect as sa_inspect,
)
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from job_engine.db import models as orm
from job_engine.domain.applicant import (
    ApplicantProfile,
    ApplicantProfileInput,
    CertificationEntry,
    CompensationExpectation,
    ConfirmedField,
    DemographicPreferences,
    EducationEntry,
    EmploymentEntry,
    FieldSource,
    LanguageProficiency,
    LocationPreferences,
    ManagedAsset,
    ManagedAssetType,
    PolicyCategory,
    ProfileSummary,
    QuestionIntent,
    ResumeAsset,
    ResumeAssetInput,
    ReusableAnswer,
    ReusableAnswerInput,
    ValueState,
    WorkAuthorization,
)
from job_engine.domain.applications import (
    ACTIVE_STATUSES,
    ApplicationException,
    ApplicationRun,
    ApplicationRunEvent,
    ApplicationRunStatus,
    AuditEventType,
    AutomationMode,
    EvidenceArtifact,
    EvidenceType,
    ExceptionStatus,
    ExceptionType,
    InvalidStateTransitionError,
    ReceiptSummary,
    ResumeAssetGrant,
    RunCheckpoint,
    calculate_answer_bank_hash,
    calculate_token_hash,
    is_terminal_status,
    redact_audit_payload,
    validate_run_transition,
)
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


class OptimisticLockError(Exception):
    """Raised when an update/delete fails due to an unexpected version."""


class ResourceNotFoundError(LookupError):
    """Raised when a requested resource does not exist."""


class DefaultResumeConflictError(Exception):
    """Raised when a default resume constraint or invariant is violated."""


_PROFILE_FIELD_NAMES: tuple[str, ...] = (
    "first_name",
    "last_name",
    "email",
    "phone",
    "city",
    "region",
    "country",
    "timezone",
    "headline",
    "summary",
    "portfolio_url",
    "linkedin_url",
    "github_url",
    "custom_urls",
    "notice_period_days",
    "employment_history",
    "education_history",
    "skills",
    "languages",
    "certifications",
    "work_authorizations",
    "compensation_expectation",
    "location_preferences",
    "demographics",
)


def _serialize_field_value(field_name: str, value: Any) -> Any:
    if value is None:
        return None
    if isinstance(value, (str, int, float, bool)):
        return value
    if isinstance(value, dict):
        return {str(k): str(v) for k, v in value.items()}
    if isinstance(value, (tuple, list)):
        items: list[Any] = []
        for item in value:
            if hasattr(item, "model_dump"):
                items.append(item.model_dump(mode="json"))
            else:
                items.append(str(item))
        return items
    if hasattr(value, "model_dump"):
        return value.model_dump(mode="json")
    return str(value)


def _deserialize_field_value(field_name: str, payload: Any) -> Any:
    if payload is None:
        return None
    if field_name in {
        "first_name",
        "last_name",
        "email",
        "phone",
        "city",
        "region",
        "country",
        "timezone",
        "headline",
        "summary",
        "portfolio_url",
        "linkedin_url",
        "github_url",
    }:
        return str(payload)
    if field_name == "custom_urls":
        return dict(payload)
    if field_name == "notice_period_days":
        return int(payload)
    if field_name == "skills":
        return tuple(str(x) for x in payload)
    if field_name == "employment_history":
        return tuple(EmploymentEntry(**item) for item in payload)
    if field_name == "education_history":
        return tuple(EducationEntry(**item) for item in payload)
    if field_name == "certifications":
        return tuple(CertificationEntry(**item) for item in payload)
    if field_name == "languages":
        return tuple(LanguageProficiency(**item) for item in payload)
    if field_name == "work_authorizations":
        return tuple(WorkAuthorization(**item) for item in payload)
    if field_name == "compensation_expectation":
        return CompensationExpectation(**payload)
    if field_name == "location_preferences":
        return LocationPreferences(**payload)
    if field_name == "demographics":
        return DemographicPreferences(**payload)
    return payload


class ProfileArchiveGuardError(Exception):
    """Raised when an attempt is made to archive a profile with active work."""


def _applicant_profile_from_row(row: orm.ApplicantProfile) -> ApplicantProfile:
    fields_by_path = {f.field_path: f for f in row.fields}
    field_kwargs: dict[str, Any] = {}
    for name in _PROFILE_FIELD_NAMES:
        f_row = fields_by_path.get(name)
        if f_row is None:
            field_kwargs[name] = ConfirmedField()
        else:
            state = ValueState(f_row.value_state)
            value = (
                _deserialize_field_value(name, f_row.value_payload)
                if state == ValueState.PROVIDED
                else None
            )
            source = FieldSource(f_row.source) if f_row.source else None
            policy = PolicyCategory(f_row.policy_category)
            field_kwargs[name] = ConfirmedField(
                state=state,
                value=value,
                source=source,
                last_confirmed_at=f_row.last_confirmed_at,
                policy_category=policy,
            )
    return ApplicantProfile(
        id=row.id,
        display_name=row.display_name,
        avatar_asset_id=row.avatar_asset_id,
        onboarding_step=row.onboarding_step,
        onboarding_completed_at=row.onboarding_completed_at,
        archived_at=row.archived_at,
        automation_preferences=dict(row.automation_preferences)
        if row.automation_preferences
        else {},
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
        **field_kwargs,
    )


def _profile_summary_from_row(
    row: orm.ApplicantProfile, is_active: bool = False
) -> ProfileSummary:
    return ProfileSummary(
        id=row.id,
        display_name=row.display_name,
        avatar_asset_id=row.avatar_asset_id,
        onboarding_step=row.onboarding_step,
        onboarding_completed_at=row.onboarding_completed_at,
        archived_at=row.archived_at,
        automation_preferences=dict(row.automation_preferences)
        if row.automation_preferences
        else {},
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
        is_active=is_active,
    )


def _managed_asset_from_row(row: orm.ManagedAsset) -> ManagedAsset:
    return ManagedAsset(
        id=row.id,
        profile_id=row.profile_id,
        asset_type=ManagedAssetType(row.asset_type),
        file_name=row.file_name,
        content_type=row.content_type,
        byte_size=row.byte_size,
        sha256=row.sha256,
        relative_path=row.relative_path,
        crop_coordinates=dict(row.crop_coordinates) if row.crop_coordinates else None,
        extracted_text=row.extracted_text,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _resume_asset_from_row(row: orm.ResumeAsset) -> ResumeAsset:
    return ResumeAsset(
        id=row.id,
        applicant_profile_id=row.applicant_profile_id,
        managed_asset_id=row.managed_asset_id,
        resume_id=row.resume_id,
        label=row.label,
        source_markdown_path=row.source_markdown_path,
        upload_pdf_path=row.upload_pdf_path,
        preview_html_path=row.preview_html_path,
        sha256=row.sha256,
        language=row.language,
        is_default=row.is_default,
        file_size_bytes=row.file_size_bytes,
        last_verified_at=row.last_verified_at,
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _reusable_answer_from_row(row: orm.ReusableAnswer) -> ReusableAnswer:
    return ReusableAnswer(
        id=row.id,
        applicant_profile_id=row.applicant_profile_id,
        answer_id=row.answer_id,
        question_intent=QuestionIntent(row.question_intent),
        jurisdiction=row.jurisdiction,
        platform_scope=row.platform_scope,
        answer_text=row.answer_text,
        policy_category=PolicyCategory(row.policy_category),
        provenance=row.provenance,
        last_confirmed_at=row.last_confirmed_at,
        expires_at=row.expires_at,
        version=row.version,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


class ApplicantVaultRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    async def get_active_profile_id(self) -> UUID | None:
        state = await self._session.get(orm.InstallationState, 1)
        if state is not None and state.active_profile_id is not None:
            # Verify active profile is not archived
            prof = await self._session.get(
                orm.ApplicantProfile, state.active_profile_id
            )
            if prof is not None and prof.archived_at is None:
                return state.active_profile_id

        first_profile = await self._session.scalar(
            select(orm.ApplicantProfile.id)
            .where(orm.ApplicantProfile.archived_at.is_(None))
            .order_by(orm.ApplicantProfile.created_at.asc())
            .limit(1)
        )
        if first_profile is not None:
            await self.set_active_profile(first_profile)
            return first_profile
        return None

    async def set_active_profile(self, profile_id: UUID) -> None:
        profile = await self.get_profile(profile_id)
        if profile is None:
            raise ResourceNotFoundError(
                f"Applicant profile {profile_id} does not exist"
            )
        if profile.archived_at is not None:
            raise ValueError(
                f"Cannot set archived profile {profile_id} as active profile"
            )

        now = _utcnow()
        state = await self._session.get(orm.InstallationState, 1)
        if state is None:
            state = orm.InstallationState(
                id=1, active_profile_id=profile_id, updated_at=now
            )
            self._session.add(state)
        else:
            state.active_profile_id = profile_id
            state.updated_at = now
        await self._session.flush()

    async def get_active_profile(self) -> ApplicantProfile | None:
        active_id = await self.get_active_profile_id()
        if active_id is None:
            return None
        return await self.get_profile(active_id)

    async def list_profiles(
        self, include_archived: bool = True
    ) -> tuple[ProfileSummary, ...]:
        active_id = await self.get_active_profile_id()
        stmt = select(orm.ApplicantProfile).order_by(
            orm.ApplicantProfile.created_at.asc()
        )
        if not include_archived:
            stmt = stmt.where(orm.ApplicantProfile.archived_at.is_(None))
        rows = (await self._session.scalars(stmt)).all()
        return tuple(
            _profile_summary_from_row(row, is_active=(row.id == active_id))
            for row in rows
        )

    async def get_profile(
        self, profile_id: UUID | None = None
    ) -> ApplicantProfile | None:
        if profile_id is None:
            return await self.get_active_profile()
        stmt = (
            select(orm.ApplicantProfile)
            .where(orm.ApplicantProfile.id == profile_id)
            .options(selectinload(orm.ApplicantProfile.fields))
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _applicant_profile_from_row(row)

    async def replace_profile(
        self,
        profile_input: ApplicantProfileInput,
        expected_version: int | None = None,
    ) -> ApplicantProfile:
        active_id = await self.get_active_profile_id()
        if expected_version is None:
            if active_id is not None:
                raise OptimisticLockError("Applicant profile already exists")
            return await self.create_profile(profile_input)

        if active_id is None:
            raise OptimisticLockError(
                "Optimistic lock conflict on applicant profile with "
                f"expected version {expected_version}: profile does not exist"
            )
        return await self.update_profile(active_id, profile_input, expected_version)

    async def create_profile(
        self, profile_input: ApplicantProfileInput
    ) -> ApplicantProfile:
        now = _utcnow()
        profile_id = uuid4()
        profile_row = orm.ApplicantProfile(
            id=profile_id,
            display_name=profile_input.display_name or "Default Applicant",
            avatar_asset_id=profile_input.avatar_asset_id,
            onboarding_step=profile_input.onboarding_step or "profile",
            onboarding_completed_at=profile_input.onboarding_completed_at,
            archived_at=None,
            automation_preferences=profile_input.automation_preferences,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self._session.add(profile_row)
        for name in _PROFILE_FIELD_NAMES:
            field: ConfirmedField[Any] = getattr(profile_input, name)
            profile_row.fields.append(
                orm.ApplicantProfileField(
                    profile_id=profile_id,
                    field_path=name,
                    value_state=field.state.value,
                    value_payload=_serialize_field_value(name, field.value),
                    source=field.source.value if field.source else None,
                    last_confirmed_at=field.last_confirmed_at,
                    policy_category=field.policy_category.value,
                    created_at=now,
                    updated_at=now,
                )
            )

        active_id = await self.get_active_profile_id()
        if active_id is None:
            await self.set_active_profile(profile_id)

        await self._session.flush()
        loaded = await self.get_profile(profile_id)
        if loaded is None:
            raise RuntimeError("Failed to load created applicant profile")
        return loaded

    async def update_profile(
        self,
        profile_id: UUID,
        profile_input: ApplicantProfileInput,
        expected_version: int,
    ) -> ApplicantProfile:
        now = _utcnow()
        stmt = (
            update(orm.ApplicantProfile)
            .where(
                orm.ApplicantProfile.id == profile_id,
                orm.ApplicantProfile.version == expected_version,
            )
            .values(
                display_name=profile_input.display_name or "Default Applicant",
                avatar_asset_id=profile_input.avatar_asset_id,
                onboarding_step=profile_input.onboarding_step or "profile",
                onboarding_completed_at=profile_input.onboarding_completed_at,
                automation_preferences=profile_input.automation_preferences,
                version=orm.ApplicantProfile.version + 1,
                updated_at=now,
            )
            .returning(orm.ApplicantProfile.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            existing = await self.get_profile(profile_id)
            if existing is None:
                raise ResourceNotFoundError(
                    f"Applicant profile {profile_id} does not exist"
                )
            raise OptimisticLockError(
                f"Optimistic lock conflict on applicant profile {profile_id} "
                f"with expected version {expected_version}"
            )

        await self._session.execute(
            delete(orm.ApplicantProfileField).where(
                orm.ApplicantProfileField.profile_id == profile_id
            )
        )
        for name in _PROFILE_FIELD_NAMES:
            field_val = getattr(profile_input, name)
            self._session.add(
                orm.ApplicantProfileField(
                    profile_id=profile_id,
                    field_path=name,
                    value_state=field_val.state.value,
                    value_payload=_serialize_field_value(name, field_val.value),
                    source=field_val.source.value if field_val.source else None,
                    policy_category=(
                        field_val.policy_category.value
                        if field_val.policy_category
                        else None
                    ),
                    last_confirmed_at=field_val.last_confirmed_at,
                    created_at=now,
                    updated_at=now,
                )
            )
        await self._session.flush()
        loaded = await self.get_profile(profile_id)
        if loaded is None:
            raise RuntimeError("Failed to load updated applicant profile")
        return loaded

    async def archive_profile(
        self, profile_id: UUID, expected_version: int
    ) -> ApplicantProfile:
        from job_engine.db.repositories import ApplicationRepository

        now = _utcnow()
        app_repo = ApplicationRepository(self._session)
        if await app_repo.has_active_runs(profile_id):
            raise ProfileArchiveGuardError(
                f"Cannot archive profile {profile_id} with active application runs"
            )

        stmt = (
            update(orm.ApplicantProfile)
            .where(
                orm.ApplicantProfile.id == profile_id,
                orm.ApplicantProfile.version == expected_version,
            )
            .values(
                archived_at=now,
                version=orm.ApplicantProfile.version + 1,
                updated_at=now,
            )
            .returning(orm.ApplicantProfile.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            existing = await self.get_profile(profile_id)
            if existing is None:
                raise ResourceNotFoundError(
                    f"Applicant profile {profile_id} does not exist"
                )
            raise OptimisticLockError(
                f"Optimistic lock conflict on applicant profile {profile_id} "
                f"with expected version {expected_version}"
            )

        # If this profile was active, set another profile as active if available
        active_id = await self.get_active_profile_id()
        if active_id == profile_id:
            next_active = await self._session.scalar(
                select(orm.ApplicantProfile.id)
                .where(
                    orm.ApplicantProfile.id != profile_id,
                    orm.ApplicantProfile.archived_at.is_(None),
                )
                .order_by(orm.ApplicantProfile.created_at.asc())
                .limit(1)
            )
            if next_active is not None:
                await self.set_active_profile(next_active)
            else:
                state = await self._session.get(orm.InstallationState, 1)
                if state:
                    state.active_profile_id = None
                    state.updated_at = now

        await self._session.flush()
        loaded = await self.get_profile(profile_id)
        if loaded is None:
            raise RuntimeError("Failed to load archived applicant profile")
        return loaded

    async def list_resumes(
        self, profile_id: UUID | None = None
    ) -> tuple[ResumeAsset, ...]:
        if profile_id is None:
            profile_id = await self.get_active_profile_id()
            if profile_id is None:
                stmt = (
                    select(orm.ResumeAsset)
                    .order_by(
                        orm.ResumeAsset.is_default.desc(), orm.ResumeAsset.label.asc()
                    )
                    .execution_options(populate_existing=True)
                )
                rows = (await self._session.scalars(stmt)).all()
                return tuple(_resume_asset_from_row(row) for row in rows)

        # Ensure profile exists
        prof = await self._session.get(orm.ApplicantProfile, profile_id)
        if prof is None:
            raise ResourceNotFoundError(
                f"Applicant profile {profile_id} does not exist"
            )

        stmt = (
            select(orm.ResumeAsset)
            .where(orm.ResumeAsset.applicant_profile_id == profile_id)
            .order_by(orm.ResumeAsset.is_default.desc(), orm.ResumeAsset.label.asc())
            .execution_options(populate_existing=True)
        )
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_resume_asset_from_row(row) for row in rows)

    async def get_resume(
        self, profile_id_or_resume_id: UUID | str, resume_id: str | None = None
    ) -> ResumeAsset | None:
        if isinstance(profile_id_or_resume_id, UUID) and resume_id is not None:
            profile_id = profile_id_or_resume_id
            r_id = resume_id
            stmt = (
                select(orm.ResumeAsset)
                .where(
                    orm.ResumeAsset.applicant_profile_id == profile_id,
                    orm.ResumeAsset.resume_id == r_id,
                )
                .execution_options(populate_existing=True)
            )
        else:
            r_id = str(profile_id_or_resume_id)
            active_id = await self.get_active_profile_id()
            if active_id is not None:
                stmt = (
                    select(orm.ResumeAsset)
                    .where(
                        orm.ResumeAsset.applicant_profile_id == active_id,
                        orm.ResumeAsset.resume_id == r_id,
                    )
                    .execution_options(populate_existing=True)
                )
            else:
                stmt = (
                    select(orm.ResumeAsset)
                    .where(orm.ResumeAsset.resume_id == r_id)
                    .execution_options(populate_existing=True)
                )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _resume_asset_from_row(row)

    async def get_resume_by_id(self, profile_id: UUID, id: UUID) -> ResumeAsset | None:
        stmt = (
            select(orm.ResumeAsset)
            .where(
                orm.ResumeAsset.applicant_profile_id == profile_id,
                orm.ResumeAsset.id == id,
            )
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _resume_asset_from_row(row)

    async def create_resume(
        self,
        profile_id_or_resume: UUID | ResumeAssetInput,
        resume_or_sha: ResumeAssetInput | str | None = None,
        sha256: str | None = None,
        *,
        file_size_bytes: int | None = None,
        last_verified_at: datetime | None = None,
    ) -> ResumeAsset:
        profile_id: UUID
        resume: ResumeAssetInput
        if isinstance(profile_id_or_resume, UUID):
            profile_id = profile_id_or_resume
            if not isinstance(resume_or_sha, ResumeAssetInput):
                raise ValueError("Expected ResumeAssetInput")
            resume = resume_or_sha
            actual_sha = sha256 or ""
        else:
            resume = profile_id_or_resume
            actual_sha = (
                resume_or_sha if isinstance(resume_or_sha, str) else sha256
            ) or ""
            p_id = resume.applicant_profile_id
            if p_id is None:
                active_id = await self.get_active_profile_id()
                if active_id is None:
                    prof_created = await self.create_profile(
                        ApplicantProfileInput(display_name="Default Applicant")
                    )
                    profile_id = prof_created.id
                else:
                    profile_id = active_id
            else:
                profile_id = p_id

        prof = await self._session.get(orm.ApplicantProfile, profile_id)
        if prof is None:
            raise ResourceNotFoundError(
                f"Applicant profile {profile_id} does not exist"
            )

        now = _utcnow()
        count = await self._session.scalar(
            select(func.count())
            .select_from(orm.ResumeAsset)
            .where(orm.ResumeAsset.applicant_profile_id == profile_id)
        )
        is_default = resume.is_default or (count == 0)
        if is_default and count and count > 0:
            await self._session.execute(
                update(orm.ResumeAsset)
                .where(
                    orm.ResumeAsset.applicant_profile_id == profile_id,
                    orm.ResumeAsset.is_default.is_(True),
                )
                .values(is_default=False, updated_at=now)
            )

        row = orm.ResumeAsset(
            id=uuid4(),
            applicant_profile_id=profile_id,
            managed_asset_id=resume.managed_asset_id,
            resume_id=resume.resume_id,
            label=resume.label,
            source_markdown_path=resume.source_markdown_path,
            upload_pdf_path=resume.upload_pdf_path,
            preview_html_path=resume.preview_html_path,
            sha256=actual_sha,
            language=resume.language,
            is_default=is_default,
            file_size_bytes=file_size_bytes,
            last_verified_at=last_verified_at or now,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self._session.add(row)
        await self._session.flush()
        return _resume_asset_from_row(row)

    async def update_resume(
        self,
        profile_id_or_resume_id: UUID | str,
        resume_id_or_none: str | None = None,
        *,
        label: str | None = None,
        is_default: bool | None = None,
        sha256: str | None = None,
        file_size_bytes: int | None = None,
        last_verified_at: datetime | None = None,
        expected_version: int,
    ) -> ResumeAsset:
        now = _utcnow()
        if isinstance(profile_id_or_resume_id, UUID) and resume_id_or_none is not None:
            profile_id = profile_id_or_resume_id
            resume_id = resume_id_or_none
        else:
            resume_id = str(profile_id_or_resume_id)
            active_id = await self.get_active_profile_id()
            if active_id is None:
                existing_res = await self._session.scalar(
                    select(orm.ResumeAsset).where(
                        orm.ResumeAsset.resume_id == resume_id
                    )
                )
                if existing_res is None:
                    raise ResourceNotFoundError(
                        f"Resume asset {resume_id} does not exist"
                    )
                profile_id = existing_res.applicant_profile_id
            else:
                profile_id = active_id

        current = await self.get_resume(profile_id, resume_id)
        if current is None:
            raise ResourceNotFoundError(
                f"Resume asset {resume_id} does not exist for profile {profile_id}"
            )

        if is_default is True:
            await self._session.execute(
                update(orm.ResumeAsset)
                .where(
                    orm.ResumeAsset.applicant_profile_id == profile_id,
                    orm.ResumeAsset.resume_id != resume_id,
                    orm.ResumeAsset.is_default.is_(True),
                )
                .values(is_default=False, updated_at=now)
            )
        elif is_default is False and current.is_default:
            count = await self._session.scalar(
                select(func.count())
                .select_from(orm.ResumeAsset)
                .where(orm.ResumeAsset.applicant_profile_id == profile_id)
            )
            if count and count > 1:
                raise DefaultResumeConflictError(
                    "Cannot unset default without promoting another default resume"
                )

        values: dict[str, Any] = {
            "version": orm.ResumeAsset.version + 1,
            "updated_at": now,
        }
        if label is not None:
            values["label"] = label
        if is_default is not None:
            values["is_default"] = is_default
        if sha256 is not None:
            values["sha256"] = sha256
        if file_size_bytes is not None:
            values["file_size_bytes"] = file_size_bytes
        if last_verified_at is not None:
            values["last_verified_at"] = last_verified_at

        stmt = (
            update(orm.ResumeAsset)
            .where(
                orm.ResumeAsset.applicant_profile_id == profile_id,
                orm.ResumeAsset.resume_id == resume_id,
                orm.ResumeAsset.version == expected_version,
            )
            .values(**values)
            .returning(orm.ResumeAsset.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            raise OptimisticLockError(
                f"Optimistic lock conflict on resume asset {resume_id} with "
                f"expected version {expected_version}"
            )
        await self._session.flush()
        loaded = await self.get_resume(profile_id, resume_id)
        if loaded is None:
            raise RuntimeError("Failed to load updated resume asset")
        return loaded

    async def delete_resume(
        self,
        profile_id_or_resume_id: UUID | str,
        resume_id_or_version: str | int | None = None,
        expected_version: int | None = None,
    ) -> None:
        if isinstance(profile_id_or_resume_id, UUID) and isinstance(
            resume_id_or_version, str
        ):
            profile_id = profile_id_or_resume_id
            resume_id = resume_id_or_version
            version = expected_version or 1
        else:
            resume_id = str(profile_id_or_resume_id)
            version = (
                int(resume_id_or_version)
                if isinstance(resume_id_or_version, int)
                else (expected_version or 1)
            )
            active_id = await self.get_active_profile_id()
            if active_id is None:
                existing_res = await self._session.scalar(
                    select(orm.ResumeAsset).where(
                        orm.ResumeAsset.resume_id == resume_id
                    )
                )
                if existing_res is None:
                    raise ResourceNotFoundError(
                        f"Resume asset {resume_id} does not exist"
                    )
                profile_id = existing_res.applicant_profile_id
            else:
                profile_id = active_id

        current = await self.get_resume(profile_id, resume_id)
        if current is None:
            raise ResourceNotFoundError(
                f"Resume asset {resume_id} does not exist for profile {profile_id}"
            )
        count = await self._session.scalar(
            select(func.count())
            .select_from(orm.ResumeAsset)
            .where(orm.ResumeAsset.applicant_profile_id == profile_id)
        )
        if current.is_default and count and count > 1:
            raise DefaultResumeConflictError(
                f"Cannot delete default resume {resume_id} while other resumes "
                "exist. Promote another resume first."
            )

        stmt = (
            delete(orm.ResumeAsset)
            .where(
                orm.ResumeAsset.applicant_profile_id == profile_id,
                orm.ResumeAsset.resume_id == resume_id,
                orm.ResumeAsset.version == version,
            )
            .returning(orm.ResumeAsset.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            raise OptimisticLockError(
                f"Optimistic lock conflict on resume asset {resume_id} with "
                f"expected version {version}"
            )
        await self._session.flush()

    async def list_answers(
        self,
        profile_id: UUID | None = None,
        *,
        question_intent: QuestionIntent | str | None = None,
        jurisdiction: str | None = None,
        platform_scope: str | None = None,
    ) -> tuple[ReusableAnswer, ...]:
        if profile_id is None:
            profile_id = await self.get_active_profile_id()
            if profile_id is None:
                stmt = select(orm.ReusableAnswer).execution_options(
                    populate_existing=True
                )
                if question_intent is not None:
                    intent_val = (
                        question_intent.value
                        if isinstance(question_intent, QuestionIntent)
                        else str(question_intent)
                    )
                    stmt = stmt.where(orm.ReusableAnswer.question_intent == intent_val)
                if jurisdiction is not None:
                    stmt = stmt.where(orm.ReusableAnswer.jurisdiction == jurisdiction)
                if platform_scope is not None:
                    stmt = stmt.where(
                        orm.ReusableAnswer.platform_scope == platform_scope
                    )
                stmt = stmt.order_by(
                    orm.ReusableAnswer.question_intent.asc(),
                    orm.ReusableAnswer.answer_id.asc(),
                )
                rows = (await self._session.scalars(stmt)).all()
                return tuple(_reusable_answer_from_row(row) for row in rows)

        prof = await self._session.get(orm.ApplicantProfile, profile_id)
        if prof is None:
            raise ResourceNotFoundError(
                f"Applicant profile {profile_id} does not exist"
            )

        stmt = (
            select(orm.ReusableAnswer)
            .where(orm.ReusableAnswer.applicant_profile_id == profile_id)
            .execution_options(populate_existing=True)
        )
        if question_intent is not None:
            intent_val = (
                question_intent.value
                if isinstance(question_intent, QuestionIntent)
                else str(question_intent)
            )
            stmt = stmt.where(orm.ReusableAnswer.question_intent == intent_val)
        if jurisdiction is not None:
            stmt = stmt.where(orm.ReusableAnswer.jurisdiction == jurisdiction)
        if platform_scope is not None:
            stmt = stmt.where(orm.ReusableAnswer.platform_scope == platform_scope)

        stmt = stmt.order_by(
            orm.ReusableAnswer.question_intent.asc(),
            orm.ReusableAnswer.answer_id.asc(),
        )
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_reusable_answer_from_row(row) for row in rows)

    async def get_answer(
        self, profile_id_or_answer_id: UUID | str, answer_id: str | None = None
    ) -> ReusableAnswer | None:
        if isinstance(profile_id_or_answer_id, UUID) and answer_id is not None:
            profile_id = profile_id_or_answer_id
            a_id = answer_id
            stmt = (
                select(orm.ReusableAnswer)
                .where(
                    orm.ReusableAnswer.applicant_profile_id == profile_id,
                    orm.ReusableAnswer.answer_id == a_id,
                )
                .execution_options(populate_existing=True)
            )
        else:
            a_id = str(profile_id_or_answer_id)
            active_id = await self.get_active_profile_id()
            if active_id is not None:
                stmt = (
                    select(orm.ReusableAnswer)
                    .where(
                        orm.ReusableAnswer.applicant_profile_id == active_id,
                        orm.ReusableAnswer.answer_id == a_id,
                    )
                    .execution_options(populate_existing=True)
                )
            else:
                stmt = (
                    select(orm.ReusableAnswer)
                    .where(orm.ReusableAnswer.answer_id == a_id)
                    .execution_options(populate_existing=True)
                )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _reusable_answer_from_row(row)

    async def create_answer(
        self,
        profile_id_or_answer: UUID | ReusableAnswerInput,
        answer: ReusableAnswerInput | None = None,
    ) -> ReusableAnswer:
        profile_id: UUID
        ans: ReusableAnswerInput
        if isinstance(profile_id_or_answer, UUID) and answer is not None:
            profile_id = profile_id_or_answer
            ans = answer
        elif isinstance(profile_id_or_answer, ReusableAnswerInput):
            ans = profile_id_or_answer
            p_id = ans.applicant_profile_id
            if p_id is None:
                active_id = await self.get_active_profile_id()
                if active_id is None:
                    prof = await self.create_profile(
                        ApplicantProfileInput(display_name="Default Applicant")
                    )
                    profile_id = prof.id
                else:
                    profile_id = active_id
            else:
                profile_id = p_id
        else:
            raise ValueError("Invalid arguments for create_answer")

        prof_row = await self._session.get(orm.ApplicantProfile, profile_id)
        if prof_row is None:
            raise ResourceNotFoundError(
                f"Applicant profile {profile_id} does not exist"
            )

        now = _utcnow()
        intent_val = (
            ans.question_intent.value
            if isinstance(ans.question_intent, QuestionIntent)
            else str(ans.question_intent)
        )
        policy_val = (
            ans.policy_category.value
            if isinstance(ans.policy_category, PolicyCategory)
            else str(ans.policy_category)
        )
        row = orm.ReusableAnswer(
            id=uuid4(),
            applicant_profile_id=profile_id,
            answer_id=ans.answer_id,
            question_intent=intent_val,
            jurisdiction=ans.jurisdiction,
            platform_scope=ans.platform_scope,
            answer_text=ans.answer_text,
            policy_category=policy_val,
            provenance=ans.provenance,
            last_confirmed_at=ans.last_confirmed_at,
            expires_at=ans.expires_at,
            version=1,
            created_at=now,
            updated_at=now,
        )
        self._session.add(row)
        await self._session.flush()
        return _reusable_answer_from_row(row)

    async def update_answer(
        self,
        profile_id_or_answer_id: UUID | str,
        answer_id_or_input: str | ReusableAnswerInput | None = None,
        answer: ReusableAnswerInput | None = None,
        expected_version: int | None = None,
    ) -> ReusableAnswer:
        now = _utcnow()
        profile_id: UUID
        answer_id: str
        ans: ReusableAnswerInput
        if isinstance(profile_id_or_answer_id, UUID) and isinstance(
            answer_id_or_input, str
        ):
            profile_id = profile_id_or_answer_id
            answer_id = answer_id_or_input
            if not isinstance(answer, ReusableAnswerInput):
                raise ValueError("Expected ReusableAnswerInput")
            ans = answer
            version = expected_version or 1
        else:
            answer_id = str(profile_id_or_answer_id)
            if not isinstance(answer_id_or_input, ReusableAnswerInput):
                raise ValueError("Expected ReusableAnswerInput")
            ans = answer_id_or_input
            version = expected_version or 1
            active_id = await self.get_active_profile_id()
            if active_id is None:
                existing_ans = await self._session.scalar(
                    select(orm.ReusableAnswer).where(
                        orm.ReusableAnswer.answer_id == answer_id
                    )
                )
                if existing_ans is None:
                    raise ResourceNotFoundError(
                        f"Reusable answer {answer_id} does not exist"
                    )
                profile_id = existing_ans.applicant_profile_id
            else:
                profile_id = active_id

        intent_val = (
            ans.question_intent.value
            if isinstance(ans.question_intent, QuestionIntent)
            else str(ans.question_intent)
        )
        policy_val = (
            ans.policy_category.value
            if isinstance(ans.policy_category, PolicyCategory)
            else str(ans.policy_category)
        )

        stmt = (
            update(orm.ReusableAnswer)
            .where(
                orm.ReusableAnswer.applicant_profile_id == profile_id,
                orm.ReusableAnswer.answer_id == answer_id,
                orm.ReusableAnswer.version == version,
            )
            .values(
                question_intent=intent_val,
                jurisdiction=ans.jurisdiction,
                platform_scope=ans.platform_scope,
                answer_text=ans.answer_text,
                policy_category=policy_val,
                provenance=ans.provenance,
                last_confirmed_at=ans.last_confirmed_at,
                expires_at=ans.expires_at,
                version=orm.ReusableAnswer.version + 1,
                updated_at=now,
            )
            .returning(orm.ReusableAnswer.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            existing = await self.get_answer(profile_id, answer_id)
            if existing is None:
                raise ResourceNotFoundError(
                    f"Reusable answer {answer_id} does not exist "
                    f"for profile {profile_id}"
                )
            raise OptimisticLockError(
                f"Optimistic lock conflict on reusable answer {answer_id} with "
                f"expected version {version}"
            )
        await self._session.flush()
        loaded = await self.get_answer(profile_id, answer_id)
        if loaded is None:
            raise RuntimeError("Failed to load updated reusable answer")
        return loaded

    async def delete_answer(
        self,
        profile_id_or_answer_id: UUID | str,
        answer_id_or_version: str | int | None = None,
        expected_version: int | None = None,
    ) -> None:
        if isinstance(profile_id_or_answer_id, UUID) and isinstance(
            answer_id_or_version, str
        ):
            profile_id = profile_id_or_answer_id
            answer_id = answer_id_or_version
            version = expected_version or 1
        else:
            answer_id = str(profile_id_or_answer_id)
            version = (
                int(answer_id_or_version)
                if isinstance(answer_id_or_version, int)
                else (expected_version or 1)
            )
            active_id = await self.get_active_profile_id()
            if active_id is None:
                existing_ans = await self._session.scalar(
                    select(orm.ReusableAnswer).where(
                        orm.ReusableAnswer.answer_id == answer_id
                    )
                )
                if existing_ans is None:
                    raise ResourceNotFoundError(
                        f"Reusable answer {answer_id} does not exist"
                    )
                profile_id = existing_ans.applicant_profile_id
            else:
                profile_id = active_id

        stmt = (
            delete(orm.ReusableAnswer)
            .where(
                orm.ReusableAnswer.applicant_profile_id == profile_id,
                orm.ReusableAnswer.answer_id == answer_id,
                orm.ReusableAnswer.version == version,
            )
            .returning(orm.ReusableAnswer.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            existing = await self.get_answer(profile_id, answer_id)
            if existing is None:
                raise ResourceNotFoundError(
                    f"Reusable answer {answer_id} does not exist "
                    f"for profile {profile_id}"
                )
            raise OptimisticLockError(
                f"Optimistic lock conflict on reusable answer {answer_id} with "
                f"expected version {version}"
            )
        await self._session.flush()

    async def create_managed_asset(self, asset: ManagedAsset) -> ManagedAsset:
        now = _utcnow()
        row = orm.ManagedAsset(
            id=asset.id,
            profile_id=asset.profile_id,
            asset_type=asset.asset_type.value
            if isinstance(asset.asset_type, ManagedAssetType)
            else str(asset.asset_type),
            file_name=asset.file_name,
            content_type=asset.content_type,
            byte_size=asset.byte_size,
            sha256=asset.sha256,
            relative_path=asset.relative_path,
            crop_coordinates=asset.crop_coordinates,
            extracted_text=asset.extracted_text,
            created_at=asset.created_at or now,
            updated_at=asset.updated_at or now,
        )
        self._session.add(row)
        await self._session.flush()
        return _managed_asset_from_row(row)

    async def get_managed_asset(
        self, profile_id: UUID, asset_id: UUID
    ) -> ManagedAsset | None:
        stmt = (
            select(orm.ManagedAsset)
            .where(
                orm.ManagedAsset.profile_id == profile_id,
                orm.ManagedAsset.id == asset_id,
            )
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _managed_asset_from_row(row)

    async def list_managed_assets(
        self, profile_id: UUID, asset_type: ManagedAssetType | str | None = None
    ) -> tuple[ManagedAsset, ...]:
        stmt = (
            select(orm.ManagedAsset)
            .where(orm.ManagedAsset.profile_id == profile_id)
            .order_by(orm.ManagedAsset.created_at.desc())
            .execution_options(populate_existing=True)
        )
        if asset_type is not None:
            val = (
                asset_type.value
                if isinstance(asset_type, ManagedAssetType)
                else str(asset_type)
            )
            stmt = stmt.where(orm.ManagedAsset.asset_type == val)
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_managed_asset_from_row(row) for row in rows)

    async def delete_managed_asset(self, profile_id: UUID, asset_id: UUID) -> None:
        stmt = (
            delete(orm.ManagedAsset)
            .where(
                orm.ManagedAsset.profile_id == profile_id,
                orm.ManagedAsset.id == asset_id,
            )
            .returning(orm.ManagedAsset.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            raise ResourceNotFoundError(
                f"Managed asset {asset_id} does not exist for profile {profile_id}"
            )
        await self._session.flush()

    async def update_managed_asset_crop(
        self, profile_id: UUID, asset_id: UUID, crop_coordinates: dict[str, Any]
    ) -> ManagedAsset:
        now = _utcnow()
        stmt = (
            update(orm.ManagedAsset)
            .where(
                orm.ManagedAsset.profile_id == profile_id,
                orm.ManagedAsset.id == asset_id,
            )
            .values(
                crop_coordinates=crop_coordinates,
                updated_at=now,
            )
            .returning(orm.ManagedAsset.id)
        )
        result = await self._session.execute(stmt)
        if result.scalar() is None:
            raise ResourceNotFoundError(
                f"Managed asset {asset_id} does not exist for profile {profile_id}"
            )
        await self._session.flush()
        loaded = await self.get_managed_asset(profile_id, asset_id)
        if loaded is None:
            raise RuntimeError("Failed to reload updated managed asset")
        return loaded


class ApplicationRunNotFoundError(LookupError):
    """Raised when an application run ID does not exist."""


class DuplicateApplicationError(Exception):
    """Raised when a duplicate application run is detected."""


class LeaseExpiredOrInvalidError(Exception):
    """Raised when a runner lease is invalid or expired."""


class GrantAlreadyConsumedError(Exception):
    """Raised when a resume asset grant token has already been consumed."""


class GrantExpiredError(Exception):
    """Raised when a resume asset grant token has expired."""


class SubmitArmedRequirementError(Exception):
    """Raised when release submit is called on a run not armed for submission."""


class SubmissionDeniedError(Exception):
    """Raised when durable run state does not authorize final submission."""


class ClaimNotReleasableError(Exception):
    """Raised when a claimed run may not be returned to the queue.

    A run that has already attempted submission, or that has reached a terminal
    status, must be reconciled through ``complete`` rather than re-queued.
    """


@dataclass(frozen=True)
class ApplicationRunInput:
    job_group_id: UUID
    source_posting_id: UUID | None
    canonical_application_url: str
    application_url: str
    platform_adapter_id: str
    resume_asset_id: UUID
    resume_sha256: str
    applicant_profile_version: int
    answer_bank_snapshot: dict[str, int]
    answer_bank_hash: str
    automation_mode: AutomationMode
    idempotency_key: str
    applicant_profile_id: UUID | None = None
    automatic_submission_authorized_at: datetime | None = None
    policy_snapshot: dict[str, Any] | None = None
    duplicate_override_confirmed_at: datetime | None = None
    duplicate_override_reason: str | None = None


@dataclass(frozen=True)
class ApplicationRunFilterCriteria:
    applicant_profile_id: UUID | None = None
    statuses: tuple[ApplicationRunStatus, ...] = ()
    modes: tuple[AutomationMode, ...] = ()
    job_group_id: UUID | None = None
    platform_adapter_id: str | None = None
    created_after: datetime | None = None
    created_before: datetime | None = None
    offset: int = 0
    limit: int = 25


@dataclass(frozen=True)
class EvidenceArtifactInput:
    evidence_type: EvidenceType
    relative_path: str
    sha256: str
    file_size_bytes: int | None = None
    captured_at: datetime | None = None
    metadata_payload: dict[str, Any] | None = None


def _receipt_summary_from_payload(
    payload: dict[str, Any] | None,
) -> ReceiptSummary | None:
    if payload is None:
        return None
    return ReceiptSummary(
        platform_adapter_id=payload["platform_adapter_id"],
        final_url=payload.get("final_url"),
        platform_receipt_id=payload.get("platform_receipt_id"),
        confirmation_signal=payload["confirmation_signal"],
        capture_timestamp=datetime.fromisoformat(payload["capture_timestamp"]),
        artifact_hash=payload["artifact_hash"],
        summary_notes=payload.get("summary_notes"),
    )


def _application_run_event_from_row(
    row: orm.ApplicationRunEvent,
) -> ApplicationRunEvent:
    return ApplicationRunEvent(
        id=row.id,
        run_id=row.run_id,
        attempt=row.attempt,
        sequence_num=row.sequence_num,
        event_type=row.event_type,
        event_payload=dict(row.event_payload),
        idempotency_key=row.idempotency_key,
        created_at=row.created_at,
    )


def _application_exception_from_row(
    row: orm.ApplicationRunException,
) -> ApplicationException:
    return ApplicationException(
        id=row.id,
        run_id=row.run_id,
        exception_type=ExceptionType(row.exception_type),
        status=ExceptionStatus(row.status),
        context_payload=dict(row.context_payload),
        resolution_payload=dict(row.resolution_payload)
        if row.resolution_payload
        else None,
        created_at=row.created_at,
        resolved_at=row.resolved_at,
    )


def _evidence_artifact_from_row(
    row: orm.ApplicationRunEvidence,
) -> EvidenceArtifact:
    return EvidenceArtifact(
        id=row.id,
        run_id=row.run_id,
        attempt=row.attempt,
        evidence_type=EvidenceType(row.evidence_type),
        relative_path=row.relative_path,
        sha256=row.sha256,
        file_size_bytes=row.file_size_bytes,
        captured_at=row.captured_at,
        metadata_payload=dict(row.metadata_payload) if row.metadata_payload else None,
    )


def _resume_grant_from_row(row: orm.ApplicationRunResumeGrant) -> ResumeAssetGrant:
    return ResumeAssetGrant(
        id=row.id,
        run_id=row.run_id,
        resume_asset_id=row.resume_asset_id,
        grant_token_hash=row.grant_token_hash,
        sha256=row.sha256,
        expires_at=row.expires_at,
        consumed_at=row.consumed_at,
        created_at=row.created_at,
    )


def _application_run_from_row(row: orm.ApplicationRun) -> ApplicationRun:
    insp = sa_inspect(row)
    unloaded = insp.unloaded if insp is not None else set()
    events = (
        tuple(_application_run_event_from_row(e) for e in row.events)
        if "events" not in unloaded and hasattr(row, "events") and row.events
        else ()
    )
    exceptions = (
        tuple(_application_exception_from_row(ex) for ex in row.exceptions)
        if "exceptions" not in unloaded
        and hasattr(row, "exceptions")
        and row.exceptions
        else ()
    )
    evidence = (
        tuple(_evidence_artifact_from_row(ev) for ev in row.evidence)
        if "evidence" not in unloaded and hasattr(row, "evidence") and row.evidence
        else ()
    )
    resume_grants = (
        tuple(_resume_grant_from_row(rg) for rg in row.resume_grants)
        if "resume_grants" not in unloaded
        and hasattr(row, "resume_grants")
        and row.resume_grants
        else ()
    )

    return ApplicationRun(
        id=row.id,
        applicant_profile_id=row.applicant_profile_id,
        job_group_id=row.job_group_id,
        source_posting_id=row.source_posting_id,
        canonical_application_url=row.canonical_application_url,
        application_url=row.application_url,
        platform_adapter_id=row.platform_adapter_id,
        resume_asset_id=row.resume_asset_id,
        resume_sha256=row.resume_sha256,
        applicant_profile_version=row.applicant_profile_version,
        answer_bank_snapshot=dict(row.answer_bank_snapshot),
        answer_bank_hash=row.answer_bank_hash,
        automation_mode=AutomationMode(row.automation_mode),
        automatic_submission_authorized_at=row.automatic_submission_authorized_at,
        status=ApplicationRunStatus(row.status),
        current_step=row.current_step,
        current_checkpoint=row.current_checkpoint,
        submit_attempted_at=row.submit_attempted_at,
        attempt_count=row.attempt_count,
        retry_failure_count=row.retry_failure_count,
        max_retries=row.max_retries,
        idempotency_key=row.idempotency_key,
        lease_token_hash=row.lease_token_hash,
        lease_expires_at=row.lease_expires_at,
        runner_id=row.runner_id,
        terminal_reason=row.terminal_reason,
        receipt_summary=_receipt_summary_from_payload(row.receipt_summary),
        policy_snapshot=dict(row.policy_snapshot) if row.policy_snapshot else None,
        duplicate_override_confirmed_at=row.duplicate_override_confirmed_at,
        duplicate_override_reason=row.duplicate_override_reason,
        created_at=row.created_at,
        updated_at=row.updated_at,
        started_at=row.started_at,
        completed_at=row.completed_at,
        events=events,
        exceptions=exceptions,
        evidence=evidence,
        resume_grants=resume_grants,
    )


class ApplicationRepository:
    def __init__(self, session: AsyncSession) -> None:
        self._session = session

    def _verify_lease_token_hash(
        self, row: orm.ApplicationRun, lease_token_hash: str, now: datetime
    ) -> None:
        if (
            row.status not in ["claimed", "running"]
            or row.lease_token_hash is None
            or not hmac.compare_digest(row.lease_token_hash, lease_token_hash)
            or row.lease_expires_at is None
            or row.lease_expires_at < now
        ):
            raise LeaseExpiredOrInvalidError(f"Valid lease not held for run {row.id}")

    async def create_run(self, input_data: ApplicationRunInput) -> ApplicationRun:
        now = _utcnow()
        profile_id = input_data.applicant_profile_id
        if profile_id is None:
            vault = ApplicantVaultRepository(self._session)
            profile_id = await vault.get_active_profile_id()
            if profile_id is None:
                resume_row = await self._session.get(
                    orm.ResumeAsset, input_data.resume_asset_id
                )
                if resume_row is not None:
                    profile_id = resume_row.applicant_profile_id
                else:
                    prof = await vault.create_profile(
                        ApplicantProfileInput(display_name="Default Applicant")
                    )
                    profile_id = prof.id

        # Check active or submitted duplicate
        existing = await self.find_active_or_submitted_by_url(
            profile_id, input_data.canonical_application_url
        )
        if existing is not None and input_data.duplicate_override_confirmed_at is None:
            raise DuplicateApplicationError(
                f"Active or submitted run {existing.id} "
                f"(status: {existing.status.value}) already exists for "
                f"canonical URL: {input_data.canonical_application_url}"
            )

        if (
            existing is not None
            and input_data.duplicate_override_confirmed_at is not None
        ):
            # Mark the previous conflicting run as overridden so
            # the partial index allows the new one
            await self._session.execute(
                update(orm.ApplicationRun)
                .where(orm.ApplicationRun.id == existing.id)
                .values(
                    duplicate_override_confirmed_at=input_data.duplicate_override_confirmed_at,
                    duplicate_override_reason=input_data.duplicate_override_reason,
                    updated_at=now,
                )
            )
            # Log override event on prior run
            prior_seq = await self._next_sequence_num(existing.id)
            self._session.add(
                orm.ApplicationRunEvent(
                    id=uuid4(),
                    run_id=existing.id,
                    attempt=existing.attempt_count or 1,
                    sequence_num=prior_seq,
                    event_type=AuditEventType.DUPLICATE_OVERRIDE.value,
                    event_payload={
                        "reason": input_data.duplicate_override_reason,
                        "confirmed_at": (
                            input_data.duplicate_override_confirmed_at.isoformat()
                        ),
                    },
                    created_at=now,
                )
            )

        run_id = uuid4()
        run_row = orm.ApplicationRun(
            id=run_id,
            applicant_profile_id=profile_id,
            job_group_id=input_data.job_group_id,
            source_posting_id=input_data.source_posting_id,
            canonical_application_url=input_data.canonical_application_url,
            application_url=input_data.application_url,
            platform_adapter_id=input_data.platform_adapter_id,
            resume_asset_id=input_data.resume_asset_id,
            resume_sha256=input_data.resume_sha256,
            applicant_profile_version=input_data.applicant_profile_version,
            answer_bank_snapshot=input_data.answer_bank_snapshot,
            answer_bank_hash=input_data.answer_bank_hash,
            automation_mode=input_data.automation_mode.value,
            automatic_submission_authorized_at=(
                input_data.automatic_submission_authorized_at
            ),
            status=ApplicationRunStatus.QUEUED.value,
            current_step="Run queued",
            current_checkpoint=None,
            submit_attempted_at=None,
            attempt_count=0,
            max_retries=2,
            idempotency_key=input_data.idempotency_key,
            lease_token_hash=None,
            lease_expires_at=None,
            runner_id=None,
            terminal_reason=None,
            receipt_summary=None,
            policy_snapshot=input_data.policy_snapshot,
            duplicate_override_confirmed_at=input_data.duplicate_override_confirmed_at,
            duplicate_override_reason=input_data.duplicate_override_reason,
            created_at=now,
            updated_at=now,
            started_at=None,
            completed_at=None,
        )
        self._session.add(run_row)

        event_row = orm.ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=1,
            sequence_num=1,
            event_type=AuditEventType.RUN_CREATED.value,
            event_payload=redact_audit_payload(
                {
                    "canonical_application_url": input_data.canonical_application_url,
                    "platform_adapter_id": input_data.platform_adapter_id,
                    "automation_mode": input_data.automation_mode.value,
                    "profile_version": input_data.applicant_profile_version,
                    "answer_bank_hash": input_data.answer_bank_hash,
                }
            ),
            created_at=now,
        )
        self._session.add(event_row)
        if input_data.automatic_submission_authorized_at is not None:
            self._session.add(
                orm.ApplicationRunEvent(
                    id=uuid4(),
                    run_id=run_id,
                    attempt=1,
                    sequence_num=2,
                    event_type=AuditEventType.AUTOMATIC_SUBMISSION_AUTHORIZED.value,
                    event_payload={
                        "authorized_at": (
                            input_data.automatic_submission_authorized_at.isoformat()
                        ),
                        "job_group_id": str(input_data.job_group_id),
                        "resume_asset_id": str(input_data.resume_asset_id),
                        "profile_version": input_data.applicant_profile_version,
                        "answer_bank_hash": input_data.answer_bank_hash,
                    },
                    created_at=now,
                )
            )
        await self._session.flush()

        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to load created application run")
        return loaded

    async def get_run(
        self, run_id: UUID, profile_id: UUID | None = None
    ) -> ApplicationRun | None:
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .options(
                selectinload(orm.ApplicationRun.events),
                selectinload(orm.ApplicationRun.exceptions),
                selectinload(orm.ApplicationRun.evidence),
                selectinload(orm.ApplicationRun.resume_grants),
            )
            .execution_options(populate_existing=True)
        )
        if profile_id is not None:
            stmt = stmt.where(orm.ApplicationRun.applicant_profile_id == profile_id)

        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _application_run_from_row(row)

    async def list_runs(
        self, criteria: ApplicationRunFilterCriteria
    ) -> tuple[tuple[ApplicationRun, ...], int]:
        stmt = select(orm.ApplicationRun).execution_options(populate_existing=True)
        count_stmt = select(func.count()).select_from(orm.ApplicationRun)

        if criteria.applicant_profile_id is not None:
            stmt = stmt.where(
                orm.ApplicationRun.applicant_profile_id == criteria.applicant_profile_id
            )
            count_stmt = count_stmt.where(
                orm.ApplicationRun.applicant_profile_id == criteria.applicant_profile_id
            )
        if criteria.statuses:
            status_vals = [s.value for s in criteria.statuses]
            stmt = stmt.where(orm.ApplicationRun.status.in_(status_vals))
            count_stmt = count_stmt.where(orm.ApplicationRun.status.in_(status_vals))
        if criteria.modes:
            mode_vals = [m.value for m in criteria.modes]
            stmt = stmt.where(orm.ApplicationRun.automation_mode.in_(mode_vals))
            count_stmt = count_stmt.where(
                orm.ApplicationRun.automation_mode.in_(mode_vals)
            )
        if criteria.job_group_id is not None:
            stmt = stmt.where(orm.ApplicationRun.job_group_id == criteria.job_group_id)
            count_stmt = count_stmt.where(
                orm.ApplicationRun.job_group_id == criteria.job_group_id
            )
        if criteria.platform_adapter_id is not None:
            stmt = stmt.where(
                orm.ApplicationRun.platform_adapter_id == criteria.platform_adapter_id
            )
            count_stmt = count_stmt.where(
                orm.ApplicationRun.platform_adapter_id == criteria.platform_adapter_id
            )
        if criteria.created_after is not None:
            stmt = stmt.where(orm.ApplicationRun.created_at >= criteria.created_after)
            count_stmt = count_stmt.where(
                orm.ApplicationRun.created_at >= criteria.created_after
            )
        if criteria.created_before is not None:
            stmt = stmt.where(orm.ApplicationRun.created_at <= criteria.created_before)
            count_stmt = count_stmt.where(
                orm.ApplicationRun.created_at <= criteria.created_before
            )

        total = await self._session.scalar(count_stmt) or 0
        stmt = (
            stmt.order_by(
                orm.ApplicationRun.created_at.desc(), orm.ApplicationRun.id.asc()
            )
            .offset(criteria.offset)
            .limit(criteria.limit)
        )
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_application_run_from_row(r) for r in rows), total

    async def find_active_or_submitted_by_url(
        self, profile_id_or_url: UUID | str, canonical_url: str | None = None
    ) -> ApplicationRun | None:
        active_and_submitted = [s.value for s in ACTIVE_STATUSES] + [
            ApplicationRunStatus.SUBMITTED.value
        ]
        if isinstance(profile_id_or_url, UUID) and canonical_url is not None:
            stmt = (
                select(orm.ApplicationRun)
                .where(
                    orm.ApplicationRun.applicant_profile_id == profile_id_or_url,
                    orm.ApplicationRun.canonical_application_url == canonical_url,
                    orm.ApplicationRun.status.in_(active_and_submitted),
                    orm.ApplicationRun.duplicate_override_confirmed_at.is_(None),
                )
                .order_by(orm.ApplicationRun.created_at.desc())
                .limit(1)
                .execution_options(populate_existing=True)
            )
        else:
            stmt = (
                select(orm.ApplicationRun)
                .where(
                    orm.ApplicationRun.canonical_application_url
                    == str(profile_id_or_url),
                    orm.ApplicationRun.status.in_(active_and_submitted),
                    orm.ApplicationRun.duplicate_override_confirmed_at.is_(None),
                )
                .order_by(orm.ApplicationRun.created_at.desc())
                .limit(1)
                .execution_options(populate_existing=True)
            )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _application_run_from_row(row)

    async def find_active_or_submitted_by_job_group(
        self, profile_id: UUID, job_group_id: UUID
    ) -> ApplicationRun | None:
        active_and_submitted = [s.value for s in ACTIVE_STATUSES] + [
            ApplicationRunStatus.SUBMITTED.value
        ]
        stmt = (
            select(orm.ApplicationRun)
            .where(
                orm.ApplicationRun.applicant_profile_id == profile_id,
                orm.ApplicationRun.job_group_id == job_group_id,
                orm.ApplicationRun.status.in_(active_and_submitted),
                orm.ApplicationRun.duplicate_override_confirmed_at.is_(None),
            )
            .order_by(orm.ApplicationRun.created_at.desc())
            .limit(1)
            .execution_options(populate_existing=True)
        )
        row = await self._session.scalar(stmt)
        if row is None:
            return None
        return _application_run_from_row(row)

    async def has_active_runs(self, profile_id: UUID) -> bool:
        stmt = select(
            exists().where(
                orm.ApplicationRun.applicant_profile_id == profile_id,
                orm.ApplicationRun.status.in_([s.value for s in ACTIVE_STATUSES]),
            )
        )
        return bool(await self._session.scalar(stmt))

    async def count_active_leases(self) -> int:
        now = _utcnow()
        active_stmt = (
            select(func.count())
            .select_from(orm.ApplicationRun)
            .where(
                orm.ApplicationRun.status.in_(["claimed", "running"]),
                orm.ApplicationRun.lease_expires_at > now,
            )
        )
        return await self._session.scalar(active_stmt) or 0

    async def count_active_runs(self) -> int:
        stmt = (
            select(func.count())
            .select_from(orm.ApplicationRun)
            .where(
                orm.ApplicationRun.status.in_(
                    [status.value for status in ACTIVE_STATUSES]
                )
            )
        )
        return await self._session.scalar(stmt) or 0

    async def authorize_active_lease(
        self, run_id: UUID, lease_token_hash: str
    ) -> ApplicationRun:
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        self._verify_lease_token_hash(row, lease_token_hash, now)
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload authorized run")
        return loaded

    async def reserve_provider_budget(
        self,
        run_id: UUID,
        estimated_cost_usd: Decimal,
        *,
        max_calls_per_run: int,
        run_cost_cap_usd: Decimal,
        batch_cost_cap_usd: Decimal,
    ) -> bool:
        """Atomically reserve one external-provider call against durable caps."""
        if estimated_cost_usd <= 0:
            raise ValueError("estimated provider cost must be positive")
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext('answer_provider_budget'))")
        )
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")

        run_cost = Decimal(row.provider_reserved_cost_usd or 0)
        batch_cost = Decimal(
            await self._session.scalar(
                select(
                    func.coalesce(
                        func.sum(orm.ApplicationRun.provider_reserved_cost_usd), 0
                    )
                )
            )
            or 0
        )
        if (
            row.provider_call_count >= max_calls_per_run
            or run_cost + estimated_cost_usd > run_cost_cap_usd
            or batch_cost + estimated_cost_usd > batch_cost_cap_usd
        ):
            return False

        row.provider_call_count += 1
        row.provider_reserved_cost_usd = run_cost + estimated_cost_usd
        row.updated_at = _utcnow()
        await self._session.flush()
        return True

    async def claim_next_run(
        self,
        runner_id: str,
        lease_token_hash: str,
        lease_duration_seconds: int,
        max_concurrency: int = 1,
        run_id: UUID | None = None,
    ) -> tuple[ApplicationRun, ResumeAssetGrant, str] | None:
        """Claim a queued run.

        When ``run_id`` is given, claim exactly that run or nothing; a targeted
        claim never substitutes a different run. When it is omitted the oldest
        queued run is claimed, preserving the original FIFO behavior.
        """
        # Acquire transaction-level advisory lock to serialize claim decisions
        await self._session.execute(
            text("SELECT pg_advisory_xact_lock(hashtext('runner_claim_queue'))")
        )

        now = _utcnow()
        # 1. Reclaim any expired leases first
        await self.reclaim_expired_leases()

        # 2. Check active non-expired concurrency limit
        active_count = await self.count_active_leases()
        if active_count >= max_concurrency:
            return None

        # 3. Pick the requested run, or the oldest QUEUED run, with SKIP LOCKED
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.status == ApplicationRunStatus.QUEUED.value)
            .order_by(orm.ApplicationRun.created_at.asc())
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if run_id is not None:
            stmt = stmt.where(orm.ApplicationRun.id == run_id)
        row = await self._session.scalar(stmt)
        if row is None:
            return None

        # 4. Transition to CLAIMED
        lease_expires = now + timedelta(seconds=lease_duration_seconds)
        row.status = ApplicationRunStatus.CLAIMED.value
        row.attempt_count += 1
        row.lease_token_hash = lease_token_hash
        row.lease_expires_at = lease_expires
        row.runner_id = runner_id
        if row.started_at is None:
            row.started_at = now
        row.updated_at = now

        # 4b. Retire every prior release record for this run. A release token
        # from an earlier attempt must stop authorizing replay once the run has
        # been claimed again.
        await self._session.execute(
            update(orm.ApplicationRunLeaseRelease)
            .where(
                orm.ApplicationRunLeaseRelease.run_id == row.id,
                orm.ApplicationRunLeaseRelease.superseded_at.is_(None),
            )
            .values(superseded_at=now)
        )

        # 5. Issue single-use resume asset grant
        raw_grant_token = secrets.token_urlsafe(32)
        grant_token_hash = calculate_token_hash(raw_grant_token)
        grant_row = orm.ApplicationRunResumeGrant(
            id=uuid4(),
            run_id=row.id,
            resume_asset_id=row.resume_asset_id,
            grant_token_hash=grant_token_hash,
            sha256=row.resume_sha256,
            expires_at=lease_expires,
            consumed_at=None,
            created_at=now,
        )
        self._session.add(grant_row)

        # 6. Append LEASE_CLAIMED event
        next_seq = await self._next_sequence_num(row.id)
        event_row = orm.ApplicationRunEvent(
            id=uuid4(),
            run_id=row.id,
            attempt=row.attempt_count,
            sequence_num=next_seq,
            event_type=AuditEventType.LEASE_CLAIMED.value,
            event_payload={
                "runner_id": runner_id,
                "attempt": row.attempt_count,
                "lease_expires_at": lease_expires.isoformat(),
            },
            created_at=now,
        )
        self._session.add(event_row)
        await self._session.flush()

        loaded_run = await self.get_run(row.id)
        loaded_grant = _resume_grant_from_row(grant_row)
        if loaded_run is None:
            raise RuntimeError("Failed to reload claimed application run")

        return loaded_run, loaded_grant, raw_grant_token

    async def heartbeat_lease(
        self, run_id: UUID, lease_token_hash: str, extend_seconds: int
    ) -> ApplicationRun:
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        if (
            row.status not in ["claimed", "running"]
            or row.lease_token_hash != lease_token_hash
            or row.lease_expires_at is None
            or row.lease_expires_at < now
        ):
            raise LeaseExpiredOrInvalidError(f"Active lease not held for run {run_id}")

        new_expires = now + timedelta(seconds=extend_seconds)
        row.lease_expires_at = new_expires
        row.updated_at = now

        # Also extend unconsumed resume grants for this run
        await self._session.execute(
            update(orm.ApplicationRunResumeGrant)
            .where(
                orm.ApplicationRunResumeGrant.run_id == run_id,
                orm.ApplicationRunResumeGrant.consumed_at.is_(None),
            )
            .values(expires_at=new_expires)
        )

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count,
                sequence_num=next_seq,
                event_type=AuditEventType.LEASE_EXTENDED.value,
                event_payload={"extended_until": new_expires.isoformat()},
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload heartbeat run")
        return loaded

    async def append_event(
        self,
        run_id: UUID,
        lease_token_hash: str,
        attempt: int,
        sequence_num: int,
        event_type: str,
        payload: dict[str, Any],
        idempotency_key: str | None = None,
    ) -> ApplicationRunEvent:
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        self._verify_lease_token_hash(row, lease_token_hash, now)

        if idempotency_key:
            existing_event = await self._session.scalar(
                select(orm.ApplicationRunEvent).where(
                    orm.ApplicationRunEvent.run_id == run_id,
                    orm.ApplicationRunEvent.idempotency_key == idempotency_key,
                )
            )
            if existing_event is not None:
                return _application_run_event_from_row(existing_event)

        max_seq = await self._max_sequence_num(run_id)
        if sequence_num != max_seq + 1:
            raise ValueError(
                f"Non-monotonic sequence number: expected {max_seq + 1}, "
                f"got {sequence_num}"
            )

        redacted = redact_audit_payload(payload)
        event_row = orm.ApplicationRunEvent(
            id=uuid4(),
            run_id=run_id,
            attempt=attempt,
            sequence_num=sequence_num,
            event_type=event_type,
            event_payload=redacted,
            idempotency_key=idempotency_key,
            created_at=now,
        )
        self._session.add(event_row)
        if row.status == ApplicationRunStatus.CLAIMED.value:
            row.status = ApplicationRunStatus.RUNNING.value
            row.updated_at = now

        await self._session.flush()
        return _application_run_event_from_row(event_row)

    async def record_checkpoint(
        self,
        run_id: UUID,
        lease_token_hash: str,
        checkpoint: str,
        step_description: str | None = None,
    ) -> ApplicationRun:
        now = _utcnow()
        row = await self._session.scalar(
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        self._verify_lease_token_hash(row, lease_token_hash, now)

        try:
            next_checkpoint = RunCheckpoint(checkpoint)
        except ValueError as exc:
            raise SubmissionDeniedError(f"Unknown checkpoint '{checkpoint}'") from exc

        checkpoint_order = tuple(RunCheckpoint)
        next_index = checkpoint_order.index(next_checkpoint)
        if row.current_checkpoint is not None:
            try:
                current_checkpoint = RunCheckpoint(row.current_checkpoint)
            except ValueError as exc:
                raise SubmissionDeniedError(
                    f"Stored checkpoint '{row.current_checkpoint}' is invalid"
                ) from exc
            current_index = checkpoint_order.index(current_checkpoint)
            if next_index <= current_index:
                raise SubmissionDeniedError(
                    f"Checkpoint '{checkpoint}' is not monotonic after "
                    f"'{row.current_checkpoint}'"
                )

        if next_checkpoint == RunCheckpoint.SUBMITTING:
            await self._validate_submission_gate(row)

        row.current_checkpoint = next_checkpoint.value
        if step_description:
            row.current_step = step_description
        if next_checkpoint == RunCheckpoint.SUBMITTING:
            row.submit_attempted_at = now
        if row.status == ApplicationRunStatus.CLAIMED.value:
            row.status = ApplicationRunStatus.RUNNING.value
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count or 1,
                sequence_num=next_seq,
                event_type=AuditEventType.CHECKPOINT_REACHED.value,
                event_payload={
                    "checkpoint": next_checkpoint.value,
                    "step_description": step_description,
                },
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload updated run")
        return loaded

    async def _validate_submission_gate(self, row: orm.ApplicationRun) -> None:
        if row.current_checkpoint != RunCheckpoint.SUBMIT_ARMED.value:
            raise SubmissionDeniedError(
                "Submission requires the prior 'submit_armed' checkpoint"
            )
        if row.submit_attempted_at is not None:
            raise SubmissionDeniedError("Final submission was already attempted")

        pending_count = await self._session.scalar(
            select(func.count())
            .select_from(orm.ApplicationRunException)
            .where(
                orm.ApplicationRunException.run_id == row.id,
                orm.ApplicationRunException.status == ExceptionStatus.PENDING.value,
            )
        )
        if (pending_count or 0) > 0:
            raise SubmissionDeniedError(
                "Pending blocking exceptions must be resolved before submission"
            )

        snapshot = dict(row.answer_bank_snapshot)
        if calculate_answer_bank_hash(snapshot) != row.answer_bank_hash:
            raise SubmissionDeniedError("Frozen answer-bank snapshot is inconsistent")
        policy_snapshot = row.policy_snapshot
        if not isinstance(policy_snapshot, dict):
            raise SubmissionDeniedError("Frozen policy snapshot is missing")
        if policy_snapshot.get("profile_version") != row.applicant_profile_version:
            raise SubmissionDeniedError("Frozen applicant-profile version is stale")
        if policy_snapshot.get("answer_bank_hash") != row.answer_bank_hash:
            raise SubmissionDeniedError("Frozen answer-bank binding is stale")

        current_profile_version = await self._session.scalar(
            select(orm.ApplicantProfile.version).where(
                orm.ApplicantProfile.id == row.applicant_profile_id
            )
        )
        if current_profile_version != row.applicant_profile_version:
            raise SubmissionDeniedError("Applicant profile changed after authorization")

        if snapshot:
            current_answer_versions = {
                answer_id: version
                for answer_id, version in (
                    await self._session.execute(
                        select(
                            orm.ReusableAnswer.answer_id,
                            orm.ReusableAnswer.version,
                        ).where(
                            orm.ReusableAnswer.applicant_profile_id
                            == row.applicant_profile_id,
                            orm.ReusableAnswer.answer_id.in_(snapshot),
                        )
                    )
                ).all()
            }
            if current_answer_versions != snapshot:
                raise SubmissionDeniedError(
                    "Answer bank changed after automatic-submission authorization"
                )

        resume = await self._session.get(orm.ResumeAsset, row.resume_asset_id)
        if resume is None:
            raise SubmissionDeniedError("Frozen resume asset no longer exists")
        if (
            policy_snapshot.get("resume_id") != resume.resume_id
            or resume.sha256 != row.resume_sha256
        ):
            raise SubmissionDeniedError("Frozen resume binding is stale")

        if row.automation_mode == AutomationMode.FULL_AUTO.value:
            if row.automatic_submission_authorized_at is None:
                raise SubmissionDeniedError(
                    "Full-auto submission lacks durable owner authorization"
                )
            return
        if row.automation_mode != AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT.value:
            raise SubmissionDeniedError(
                f"Unsupported automation mode '{row.automation_mode}'"
            )

        released = await self._session.scalar(
            select(
                exists().where(
                    orm.ApplicationRunEvent.run_id == row.id,
                    orm.ApplicationRunEvent.event_type
                    == AuditEventType.SUBMIT_RELEASED.value,
                )
            )
        )
        if not released:
            raise SubmissionDeniedError(
                "Semi-auto submission requires release-submit authorization"
            )

    async def raise_exception(
        self,
        run_id: UUID,
        lease_token_hash: str,
        exception_type: ExceptionType,
        context_payload: dict[str, Any] | None = None,
    ) -> ApplicationException:
        now = _utcnow()
        row = await self._session.get(orm.ApplicationRun, run_id)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        self._verify_lease_token_hash(row, lease_token_hash, now)

        exc_row = orm.ApplicationRunException(
            id=uuid4(),
            run_id=run_id,
            exception_type=exception_type.value,
            status=ExceptionStatus.PENDING.value,
            context_payload=redact_audit_payload(context_payload or {}),
            resolution_payload=None,
            created_at=now,
            resolved_at=None,
        )
        self._session.add(exc_row)

        if exception_type in {
            ExceptionType.AUTH_REQUIRED,
            ExceptionType.CAPTCHA_REQUIRED,
        }:
            target_status = ApplicationRunStatus.PAUSED_AUTH.value
        else:
            target_status = ApplicationRunStatus.NEEDS_INPUT.value

        row.status = target_status
        row.lease_token_hash = None
        row.lease_expires_at = None
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count,
                sequence_num=next_seq,
                event_type=AuditEventType.EXCEPTION_RAISED.value,
                event_payload={
                    "exception_type": exception_type.value,
                    "target_status": target_status,
                },
                created_at=now,
            )
        )
        await self._session.flush()
        return _application_exception_from_row(exc_row)

    async def resolve_exception(
        self, run_id: UUID, exception_id: UUID, resolution_payload: dict[str, Any]
    ) -> ApplicationRun:
        now = _utcnow()
        exc = await self._session.scalar(
            select(orm.ApplicationRunException)
            .where(orm.ApplicationRunException.id == exception_id)
            .with_for_update()
        )
        if exc is None or exc.run_id != run_id:
            raise ResourceNotFoundError(
                f"Exception {exception_id} not found for run {run_id}"
            )
        if exc.status != ExceptionStatus.PENDING.value:
            raise ValueError(f"Exception {exception_id} is not pending")

        exc.status = ExceptionStatus.RESOLVED.value
        exc.resolution_payload = redact_audit_payload(resolution_payload)
        exc.resolved_at = now

        # Check remaining pending exceptions
        remaining_pending = await self._session.scalar(
            select(func.count())
            .select_from(orm.ApplicationRunException)
            .where(
                orm.ApplicationRunException.run_id == run_id,
                orm.ApplicationRunException.status == ExceptionStatus.PENDING.value,
            )
        )
        row = await self._session.get(orm.ApplicationRun, run_id)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")

        if (remaining_pending or 0) == 0 and row.status in [
            "needs_input",
            "paused_auth",
        ]:
            row.status = ApplicationRunStatus.QUEUED.value
            row.updated_at = now

            next_seq = await self._next_sequence_num(run_id)
            self._session.add(
                orm.ApplicationRunEvent(
                    id=uuid4(),
                    run_id=run_id,
                    attempt=row.attempt_count or 1,
                    sequence_num=next_seq,
                    event_type=AuditEventType.EXCEPTION_RESOLVED.value,
                    event_payload={"resolved_exception_id": str(exception_id)},
                    created_at=now,
                )
            )

        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload resolved run")
        return loaded

    async def release_submit(
        self, run_id: UUID, owner_confirmation: str
    ) -> ApplicationRun:
        now = _utcnow()
        row = await self._session.get(orm.ApplicationRun, run_id)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        if row.automation_mode != AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT.value:
            raise SubmitArmedRequirementError(
                "release-submit is only available for "
                "SEMI_AUTO_PAUSE_BEFORE_SUBMIT runs"
            )
        if row.current_checkpoint != RunCheckpoint.SUBMIT_ARMED.value:
            raise SubmitArmedRequirementError(
                f"Run {run_id} checkpoint is '{row.current_checkpoint}', "
                f"expected 'submit_armed'"
            )
        if row.status != ApplicationRunStatus.NEEDS_INPUT.value:
            raise SubmitArmedRequirementError(
                f"Run {run_id} status is '{row.status}', expected 'needs_input'"
            )

        pending_rows = (
            await self._session.scalars(
                select(orm.ApplicationRunException)
                .where(
                    orm.ApplicationRunException.run_id == run_id,
                    orm.ApplicationRunException.status == ExceptionStatus.PENDING.value,
                )
                .with_for_update()
            )
        ).all()
        if (
            len(pending_rows) != 1
            or pending_rows[0].exception_type != ExceptionType.SEMI_AUTO_ARMED.value
        ):
            raise SubmitArmedRequirementError(
                "release-submit requires only the pending semi-auto armed exception"
            )

        armed_exception = pending_rows[0]
        armed_exception.status = ExceptionStatus.RESOLVED.value
        armed_exception.resolution_payload = {
            "released_for_submission": True,
        }
        armed_exception.resolved_at = now

        row.status = ApplicationRunStatus.QUEUED.value
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count or 1,
                sequence_num=next_seq,
                event_type=AuditEventType.SUBMIT_RELEASED.value,
                event_payload={"owner_confirmation": owner_confirmation},
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload released run")
        return loaded

    async def release_claim(
        self,
        run_id: UUID,
        lease_token_hash: str,
        runner_id: str,
        reason: str,
        request_id: str,
    ) -> ApplicationRun:
        """Return a claimed run to the queue without consuming retry budget.

        Idempotent: replaying the exact same release (same lease token, runner
        ID, reason, and request ID) against a still-current release record is a
        no-op that returns the run unchanged. Every other combination is a lease
        authorization failure.
        """
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")

        # CRITICAL INVARIANT: a run that may have reached the employer must
        # never be re-queued. It is reconciled through complete_run instead.
        if (
            row.submit_attempted_at is not None
            or row.current_checkpoint == RunCheckpoint.SUBMITTING.value
        ):
            raise ClaimNotReleasableError(
                f"Run {run_id} has attempted submission and cannot be released; "
                "reconcile it through complete instead"
            )
        if is_terminal_status(ApplicationRunStatus(row.status)):
            raise ClaimNotReleasableError(
                f"Run {run_id} is terminal ('{row.status}') and cannot be released"
            )

        existing = await self._session.scalar(
            select(orm.ApplicationRunLeaseRelease).where(
                orm.ApplicationRunLeaseRelease.run_id == run_id,
                orm.ApplicationRunLeaseRelease.released_lease_token_hash
                == lease_token_hash,
            )
        )
        if existing is not None:
            # Replay. Every identifying attribute must match, and the record
            # must not have been retired by a later claim. Failures share one
            # message so a caller cannot probe which attribute mismatched.
            if (
                existing.superseded_at is not None
                or existing.runner_id != runner_id
                or existing.reason != reason
                or existing.request_id != request_id
            ):
                raise LeaseExpiredOrInvalidError(
                    f"Lease for run {run_id} is invalid or expired"
                )
            loaded = await self.get_run(run_id)
            if loaded is None:
                raise RuntimeError("Failed to reload released run")
            return loaded

        self._verify_lease_token_hash(row, lease_token_hash, now)

        released_attempt = row.attempt_count
        # attempt_count is attempt identity and stays monotonic; a release
        # performs no work, so it advances no retry counter either.
        row.status = ApplicationRunStatus.QUEUED.value
        row.lease_token_hash = None
        row.lease_expires_at = None
        row.updated_at = now

        # The grant issued with this lease must not outlive it.
        await self._session.execute(
            update(orm.ApplicationRunResumeGrant)
            .where(
                orm.ApplicationRunResumeGrant.run_id == run_id,
                orm.ApplicationRunResumeGrant.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )

        self._session.add(
            orm.ApplicationRunLeaseRelease(
                id=uuid4(),
                run_id=run_id,
                attempt=released_attempt,
                released_lease_token_hash=lease_token_hash,
                runner_id=runner_id,
                reason=reason,
                request_id=request_id,
                superseded_at=None,
                created_at=now,
            )
        )

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=released_attempt,
                sequence_num=next_seq,
                event_type=AuditEventType.LEASE_RELEASED.value,
                event_payload=redact_audit_payload(
                    {
                        "reason": reason,
                        "runner_id": runner_id,
                        "attempt": released_attempt,
                    }
                ),
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload released run")
        return loaded

    async def resume_run(self, run_id: UUID) -> ApplicationRun:
        now = _utcnow()
        row = await self._session.get(orm.ApplicationRun, run_id)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        if row.status not in ["paused_auth", "failed_retryable"]:
            raise InvalidStateTransitionError(
                f"Cannot resume run {run_id} in status '{row.status}'"
            )

        row.status = ApplicationRunStatus.QUEUED.value
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count or 1,
                sequence_num=next_seq,
                event_type=AuditEventType.STATUS_CHANGED.value,
                event_payload={
                    "new_status": "queued",
                    "reason": "User requested resume",
                },
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload resumed run")
        return loaded

    async def cancel_run(
        self, run_id: UUID, reason: str | None = None
    ) -> ApplicationRun:
        now = _utcnow()
        row = await self._session.get(orm.ApplicationRun, run_id)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        validate_run_transition(
            ApplicationRunStatus(row.status), ApplicationRunStatus.CANCELLED
        )

        row.status = ApplicationRunStatus.CANCELLED.value
        row.terminal_reason = reason or "Cancelled by user"
        row.completed_at = now
        row.lease_token_hash = None
        row.lease_expires_at = None
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count or 1,
                sequence_num=next_seq,
                event_type=AuditEventType.RUN_CANCELLED.value,
                event_payload={"reason": row.terminal_reason},
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload cancelled run")
        return loaded

    async def override_duplicate(
        self, run_id: UUID, owner_confirmation: str, reason: str
    ) -> ApplicationRun:
        now = _utcnow()
        row = await self._session.get(orm.ApplicationRun, run_id)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")

        row.duplicate_override_confirmed_at = now
        row.duplicate_override_reason = reason
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count or 1,
                sequence_num=next_seq,
                event_type=AuditEventType.DUPLICATE_OVERRIDE.value,
                event_payload={
                    "owner_confirmation": owner_confirmation,
                    "reason": reason,
                    "confirmed_at": now.isoformat(),
                },
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload overridden run")
        return loaded

    async def complete_run(
        self,
        run_id: UUID,
        lease_token_hash: str,
        terminal_status: ApplicationRunStatus,
        terminal_reason: str | None = None,
        receipt_summary: ReceiptSummary | None = None,
        evidence_items: Sequence[EvidenceArtifactInput] = (),
    ) -> ApplicationRun:
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRun)
            .where(orm.ApplicationRun.id == run_id)
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ApplicationRunNotFoundError(f"Run {run_id} not found")
        self._verify_lease_token_hash(row, lease_token_hash, now)

        if not is_terminal_status(terminal_status):
            raise ValueError(f"Status {terminal_status.value} is not a terminal status")

        attempted_submission = (
            row.submit_attempted_at is not None
            or row.current_checkpoint == RunCheckpoint.SUBMITTING.value
        )
        if terminal_status in {
            ApplicationRunStatus.SUBMITTED,
            ApplicationRunStatus.SUBMISSION_UNKNOWN,
        }:
            if not attempted_submission:
                raise SubmissionDeniedError(
                    f"{terminal_status.value} requires a recorded submit attempt"
                )
            await self._validate_submission_gate_after_attempt(row)
        if terminal_status == ApplicationRunStatus.SUBMITTED:
            if receipt_summary is None:
                raise ValueError(
                    "SUBMITTED status strictly requires verified receipt_summary"
                )
            row.receipt_summary = receipt_summary.model_dump(mode="json")
            row.current_checkpoint = RunCheckpoint.SUBMITTED.value
            row.current_step = "Application submitted successfully"

        for item in evidence_items:
            ev_row = orm.ApplicationRunEvidence(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count,
                evidence_type=item.evidence_type.value,
                relative_path=item.relative_path,
                sha256=item.sha256,
                file_size_bytes=item.file_size_bytes,
                captured_at=item.captured_at or now,
                metadata_payload=item.metadata_payload,
            )
            self._session.add(ev_row)

        row.status = terminal_status.value
        row.terminal_reason = terminal_reason
        row.completed_at = now
        row.lease_token_hash = None
        row.lease_expires_at = None
        row.updated_at = now

        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=row.attempt_count,
                sequence_num=next_seq,
                event_type=AuditEventType.RUN_COMPLETED.value,
                event_payload={
                    "terminal_status": terminal_status.value,
                    "terminal_reason": terminal_reason,
                    "has_receipt": receipt_summary is not None,
                },
                created_at=now,
            )
        )
        await self._session.flush()
        loaded = await self.get_run(run_id)
        if loaded is None:
            raise RuntimeError("Failed to reload completed run")
        return loaded

    async def _validate_submission_gate_after_attempt(
        self, row: orm.ApplicationRun
    ) -> None:
        if (
            row.current_checkpoint != RunCheckpoint.SUBMITTING.value
            or row.submit_attempted_at is None
        ):
            raise SubmissionDeniedError("Submit-attempt state is inconsistent")
        if row.automation_mode == AutomationMode.FULL_AUTO.value:
            if row.automatic_submission_authorized_at is None:
                raise SubmissionDeniedError(
                    "Full-auto submission lacks durable owner authorization"
                )
            return
        if row.automation_mode != AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT.value:
            raise SubmissionDeniedError(
                f"Unsupported automation mode '{row.automation_mode}'"
            )
        released = await self._session.scalar(
            select(
                exists().where(
                    orm.ApplicationRunEvent.run_id == row.id,
                    orm.ApplicationRunEvent.event_type
                    == AuditEventType.SUBMIT_RELEASED.value,
                )
            )
        )
        if not released:
            raise SubmissionDeniedError(
                "Semi-auto submission lacks release-submit authorization"
            )

    async def consume_resume_grant(
        self, run_id: UUID, grant_token_hash: str
    ) -> ResumeAssetGrant:
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRunResumeGrant)
            .where(
                orm.ApplicationRunResumeGrant.run_id == run_id,
                orm.ApplicationRunResumeGrant.grant_token_hash == grant_token_hash,
            )
            .with_for_update()
        )
        row = await self._session.scalar(stmt)
        if row is None:
            raise ResourceNotFoundError(f"Resume grant not found for run {run_id}")
        if row.consumed_at is not None:
            raise GrantAlreadyConsumedError("Resume grant has already been consumed")
        if row.expires_at < now:
            raise GrantExpiredError("Resume grant has expired")

        row.consumed_at = now
        next_seq = await self._next_sequence_num(run_id)
        self._session.add(
            orm.ApplicationRunEvent(
                id=uuid4(),
                run_id=run_id,
                attempt=1,
                sequence_num=next_seq,
                event_type=AuditEventType.RESUME_ASSET_RETRIEVED.value,
                event_payload={"sha256": row.sha256},
                created_at=now,
            )
        )
        await self._session.flush()
        return _resume_grant_from_row(row)

    async def add_evidence_artifact(
        self,
        run_id: UUID,
        attempt: int,
        evidence_type: EvidenceType,
        relative_path: str,
        sha256: str,
        file_size_bytes: int | None = None,
        metadata_payload: dict[str, Any] | None = None,
    ) -> EvidenceArtifact:
        now = _utcnow()
        ev_row = orm.ApplicationRunEvidence(
            id=uuid4(),
            run_id=run_id,
            attempt=attempt,
            evidence_type=evidence_type.value,
            relative_path=relative_path,
            sha256=sha256,
            file_size_bytes=file_size_bytes,
            captured_at=now,
            metadata_payload=metadata_payload,
        )
        self._session.add(ev_row)
        await self._session.flush()
        return _evidence_artifact_from_row(ev_row)

    async def list_events(
        self,
        run_id: UUID | None = None,
        since_sequence: int | None = None,
        since_timestamp: datetime | None = None,
    ) -> tuple[ApplicationRunEvent, ...]:
        stmt = select(orm.ApplicationRunEvent).execution_options(populate_existing=True)
        if run_id is not None:
            stmt = stmt.where(orm.ApplicationRunEvent.run_id == run_id)
        if since_sequence is not None:
            stmt = stmt.where(orm.ApplicationRunEvent.sequence_num > since_sequence)
        if since_timestamp is not None:
            stmt = stmt.where(orm.ApplicationRunEvent.created_at > since_timestamp)

        stmt = stmt.order_by(
            orm.ApplicationRunEvent.created_at.asc(),
            orm.ApplicationRunEvent.sequence_num.asc(),
        )
        rows = (await self._session.scalars(stmt)).all()
        return tuple(_application_run_event_from_row(r) for r in rows)

    async def reclaim_expired_leases(self) -> int:
        now = _utcnow()
        stmt = (
            select(orm.ApplicationRun)
            .where(
                orm.ApplicationRun.status.in_(["claimed", "running"]),
                orm.ApplicationRun.lease_expires_at <= now,
            )
            .with_for_update()
        )
        expired_rows = (await self._session.scalars(stmt)).all()
        reclaimed_count = 0

        for row in expired_rows:
            reclaimed_count += 1
            # CRITICAL INVARIANT: If submit_attempted_at is NOT NULL
            # (or checkpoint is submitting), never re-queue! Must transition
            # to SUBMISSION_UNKNOWN.
            if (
                row.submit_attempted_at is not None
                or row.current_checkpoint == RunCheckpoint.SUBMITTING.value
            ):
                row.status = ApplicationRunStatus.SUBMISSION_UNKNOWN.value
                row.terminal_reason = (
                    "Runner lease expired during or after submit attempt "
                    "without confirmed receipt."
                )
                row.completed_at = now
                row.lease_token_hash = None
                row.lease_expires_at = None
                row.updated_at = now

                next_seq = await self._next_sequence_num(row.id)
                self._session.add(
                    orm.ApplicationRunEvent(
                        id=uuid4(),
                        run_id=row.id,
                        attempt=row.attempt_count,
                        sequence_num=next_seq,
                        event_type=AuditEventType.LEASE_EXPIRED.value,
                        event_payload={
                            "action": "marked_submission_unknown",
                            "reason": row.terminal_reason,
                        },
                        created_at=now,
                    )
                )
            else:
                # Submit was not attempted; safe to retry or mark failed_final.
                # Retry budget is tracked separately from attempt_count, which
                # is attempt identity and must stay monotonic.
                row.retry_failure_count += 1
                if row.retry_failure_count < row.max_retries:
                    row.status = ApplicationRunStatus.QUEUED.value
                    row.lease_token_hash = None
                    row.lease_expires_at = None
                    row.updated_at = now

                    next_seq = await self._next_sequence_num(row.id)
                    self._session.add(
                        orm.ApplicationRunEvent(
                            id=uuid4(),
                            run_id=row.id,
                            attempt=row.attempt_count,
                            sequence_num=next_seq,
                            event_type=AuditEventType.LEASE_EXPIRED.value,
                            event_payload={"action": "requeued_for_retry"},
                            created_at=now,
                        )
                    )
                else:
                    row.status = ApplicationRunStatus.FAILED_FINAL.value
                    row.terminal_reason = "Max retries exceeded on lease expiry"
                    row.completed_at = now
                    row.lease_token_hash = None
                    row.lease_expires_at = None
                    row.updated_at = now

                    next_seq = await self._next_sequence_num(row.id)
                    self._session.add(
                        orm.ApplicationRunEvent(
                            id=uuid4(),
                            run_id=row.id,
                            attempt=row.attempt_count,
                            sequence_num=next_seq,
                            event_type=AuditEventType.LEASE_EXPIRED.value,
                            event_payload={"action": "marked_failed_final"},
                            created_at=now,
                        )
                    )

        if reclaimed_count > 0:
            await self._session.flush()
        return reclaimed_count

    async def _next_sequence_num(self, run_id: UUID) -> int:
        return (await self._max_sequence_num(run_id)) + 1

    async def _max_sequence_num(self, run_id: UUID) -> int:
        stmt = select(func.max(orm.ApplicationRunEvent.sequence_num)).where(
            orm.ApplicationRunEvent.run_id == run_id
        )
        val = await self._session.scalar(stmt)
        return val if val is not None else 0
