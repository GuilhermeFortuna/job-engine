from datetime import UTC, datetime
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from job_engine.db import models as orm
from job_engine.domain.enums import IngestionRunStatus
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
        EligibleLocation(region=item.region, evidence_text=item.evidence_text)
        for item in row.eligible_locations
    )
    return JobGroup(
        id=row.id,
        title=row.title,
        title_original=row.title_original,
        company=row.company,
        company_original=row.company_original,
        description=row.description,
        location_original=row.location_original,
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
    row.company = group.company
    row.company_original = group.company_original
    row.description = group.description
    row.location_original = group.location_original
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


def _replace_group_children(row: orm.JobGroup, group: JobGroupInput) -> None:
    row.technologies.clear()
    row.eligible_locations.clear()
    for term in group.technologies:
        row.technologies.append(
            orm.JobGroupTechnology(term=term.term, source_text=term.source_text)
        )
    for location in group.eligible_locations:
        row.eligible_locations.append(
            orm.JobGroupEligibleLocation(
                region=location.region, evidence_text=location.evidence_text
            )
        )


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
        update_fields = {
            key: values[key] for key in values if key not in unchanged
        }
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
        _replace_group_children(row, group)
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
            ),
        )
        if row is None:
            raise JobGroupNotFoundError(str(group_id))
        _apply_job_group_fields(row, group)
        _replace_group_children(row, group)
        await self._session.flush()
        return await self._require_job_group(group_id)

    async def add_posting_to_group(self, group_id: UUID, posting_id: UUID) -> None:
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

    async def _require_job_group(self, group_id: UUID) -> JobGroup:
        loaded = await self.get_job_group(group_id)
        if loaded is None:
            raise JobGroupNotFoundError(str(group_id))
        return loaded


def _job_group_load_options() -> tuple[Any, ...]:
    return (
        selectinload(orm.JobGroup.technologies),
        selectinload(orm.JobGroup.eligible_locations),
        selectinload(orm.JobGroup.posting_links).selectinload(
            orm.JobGroupPosting.source_posting
        ),
    )


def _job_group_from_loaded_row(row: orm.JobGroup) -> JobGroup:
    postings = tuple(
        _source_posting_from_row(link.source_posting)
        for link in sorted(row.posting_links, key=lambda item: item.linked_at)
    )
    return _job_group_from_row(row, postings)
