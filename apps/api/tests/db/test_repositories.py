from datetime import UTC, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.models import SourcePosting as SourcePostingRow
from job_engine.db.repositories import CatalogRepository
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
    IngestionRunCompletion,
    JobGroupInput,
    SourcePostingInput,
    TechnologyTerm,
)


def _aware_now() -> datetime:
    return datetime(2026, 8, 16, 23, 30, tzinfo=UTC)


def _source_posting(**overrides: object) -> SourcePostingInput:
    payload: dict[str, object] = {
        "source_id": "jobicy",
        "source_posting_id": "abc-123",
        "source_name": "Jobicy",
        "application_url": "https://jobicy.com/jobs/abc-123",
        "application_url_canonical": "https://jobicy.com/jobs/abc-123",
        "title_original": "Python Engineer",
        "company_original": "Acme Ltd",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "remote_status": RemoteStatus.REMOTE,
        "employment_type": EmploymentType.FULL_TIME,
        "seniority": Seniority.MID,
        "seniority_original": "Mid-level",
        "compensation": Compensation(original_text="R$ 10k/mês", currency="BRL"),
        "technologies_original_text": "Python, FastAPI",
        "location_eligibility_evidence": "Remote in Brazil",
        "published_at": _aware_now(),
        "source_timestamp": _aware_now(),
        "first_seen_at": _aware_now(),
        "last_seen_at": _aware_now(),
        "closed_at": None,
        "status": JobStatus.ACTIVE,
        "ingestion_run_id": None,
        "adapter_version": "1.0.0",
        "raw_source_metadata": {"feed": "programming"},
    }
    payload.update(overrides)
    return SourcePostingInput.model_validate(payload)


def _job_group(**overrides: object) -> JobGroupInput:
    payload: dict[str, object] = {
        "title": "Python Engineer",
        "title_original": "Python Engineer (Backend)",
        "title_comparison_key": "python engineer",
        "company": "Acme",
        "company_original": "Acme Ltd",
        "company_comparison_key": "acme",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "location_comparison_key": "são paulo brazil",
        "location_normalized_country": "BR",
        "location_normalized_region": "latin_america",
        "remote_status": RemoteStatus.REMOTE,
        "employment_type": EmploymentType.FULL_TIME,
        "seniority": Seniority.MID,
        "seniority_original": "Mid-level",
        "compensation": Compensation(
            original_text="R$ 10k/mês",
            currency="BRL",
            period="month",
            minimum=Decimal("10000"),
            annual_usd_minimum=None,
        ),
        "published_at": _aware_now(),
        "first_seen_at": _aware_now(),
        "last_seen_at": _aware_now(),
        "closed_at": None,
        "status": JobStatus.ACTIVE,
        "location_eligibility_unknown": False,
        "technologies": (TechnologyTerm(term="Python", source_text="Python, FastAPI"),),
        "eligible_locations": (
            EligibleLocation(
                region=LocationEligibilityRegion.BRAZIL,
                evidence_text="Remote in Brazil",
            ),
        ),
        "role_families": ("python",),
        "last_ingestion_run_id": None,
    }
    payload.update(overrides)
    return JobGroupInput.model_validate(payload)


async def test_ingestion_run_lifecycle_records_counts_and_errors(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)

    run = await repo.start_ingestion_run("jobicy", adapter_version="1.0.0")
    assert run.status is IngestionRunStatus.RUNNING
    assert run.completed_at is None

    completed = await repo.complete_ingestion_run(
        run.id,
        IngestionRunCompletion(
            status=IngestionRunStatus.PARTIAL_SUCCESS,
            fetched_count=10,
            accepted_count=8,
            rejected_count=2,
            inserted_count=5,
            updated_count=3,
            marked_stale_count=1,
            marked_closed_count=0,
            error_summaries=(
                ErrorSummary(code="malformed", message="skipped posting x"),
            ),
        ),
    )

    assert completed.status is IngestionRunStatus.PARTIAL_SUCCESS
    assert completed.completed_at is not None
    assert completed.completed_at.tzinfo is UTC
    assert completed.fetched_count == 10
    assert completed.rejected_count == 2
    assert completed.error_summaries[0].message == "skipped posting x"


async def test_source_posting_upsert_is_idempotent(db_session: AsyncSession) -> None:
    repo = CatalogRepository(db_session)
    first = await repo.upsert_source_posting(_source_posting(title_original="Original"))
    second = await repo.upsert_source_posting(
        _source_posting(title_original="Updated title", last_seen_at=_aware_now())
    )
    await db_session.flush()

    count = await db_session.scalar(select(func.count()).select_from(SourcePostingRow))
    loaded = await repo.get_source_posting("jobicy", "abc-123")

    assert count == 1
    assert first.id == second.id
    assert loaded is not None
    assert loaded.title_original == "Updated title"
    assert loaded.first_seen_at == first.first_seen_at


async def test_source_posting_uniqueness_is_enforced_by_postgresql(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    await repo.upsert_source_posting(_source_posting())
    await db_session.flush()

    db_session.add(
        SourcePostingRow(
            source_id="jobicy",
            source_posting_id="abc-123",
            source_name="Jobicy",
            application_url="https://jobicy.com/jobs/dup",
            title_original="Dup",
            company_original="Acme",
            remote_status=RemoteStatus.UNKNOWN,
            employment_type=EmploymentType.UNKNOWN,
            seniority=Seniority.UNKNOWN,
            first_seen_at=_aware_now(),
            last_seen_at=_aware_now(),
            status=JobStatus.UNKNOWN,
        )
    )
    with pytest.raises(IntegrityError):
        await db_session.flush()


async def test_upsert_rolls_back_with_the_session(db_session: AsyncSession) -> None:
    repo = CatalogRepository(db_session)
    await repo.upsert_source_posting(_source_posting())
    await db_session.flush()
    await db_session.rollback()

    assert await repo.get_source_posting("jobicy", "abc-123") is None


async def test_job_group_round_trips_original_and_normalized_values(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    offset = timezone(timedelta(hours=-3))
    local = datetime(2026, 8, 16, 20, 30, tzinfo=offset)
    created = await repo.create_job_group(
        _job_group(
            seniority=Seniority.UNKNOWN,
            seniority_original="ninja",
            first_seen_at=local,
            compensation=Compensation(
                original_text="R$ 10k/mês",
                currency="BRL",
                period="month",
                minimum=Decimal("10000"),
                annual_usd_minimum=None,
            ),
        )
    )
    loaded = await repo.get_job_group(created.id)

    assert loaded is not None
    assert loaded.title == "Python Engineer"
    assert loaded.title_original == "Python Engineer (Backend)"
    assert loaded.seniority is Seniority.UNKNOWN
    assert loaded.seniority_original == "ninja"
    assert loaded.compensation.original_text == "R$ 10k/mês"
    assert loaded.compensation.minimum == Decimal("10000")
    assert loaded.compensation.annual_usd_minimum is None
    assert loaded.first_seen_at == datetime(2026, 8, 16, 23, 30, tzinfo=UTC)
    assert loaded.technologies[0].term == "Python"
    assert loaded.eligible_locations[0].region == "brazil"


async def test_multiple_source_postings_round_trip_on_one_job_group(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    group = await repo.create_job_group(_job_group())
    first = await repo.upsert_source_posting(_source_posting())
    second = await repo.upsert_source_posting(
        _source_posting(
            source_id="himalayas",
            source_posting_id="xyz-9",
            source_name="Himalayas",
            application_url="https://himalayas.app/jobs/xyz-9",
        )
    )
    await repo.add_posting_to_group(group.id, first.id)
    await repo.add_posting_to_group(group.id, second.id)

    loaded = await repo.get_job_group(group.id)
    by_source = await repo.get_job_group_by_source_posting("himalayas", "xyz-9")

    assert loaded is not None
    assert {posting.source_id for posting in loaded.source_postings} == {
        "jobicy",
        "himalayas",
    }
    assert by_source is not None
    assert by_source.id == group.id
    assert first.raw_source_metadata == {"feed": "programming"}


async def test_update_job_group_replaces_child_rows(db_session: AsyncSession) -> None:
    repo = CatalogRepository(db_session)
    created = await repo.create_job_group(_job_group())
    updated = await repo.update_job_group(
        created.id,
        _job_group(
            location_eligibility_unknown=True,
            eligible_locations=(),
            technologies=(TechnologyTerm(term="FastAPI", source_text="FastAPI"),),
        ),
    )
    loaded = await repo.get_job_group(created.id)

    assert updated.location_eligibility_unknown is True
    assert loaded is not None
    assert loaded.eligible_locations == ()
    assert [term.term for term in loaded.technologies] == ["FastAPI"]
    assert loaded.role_families == ("python",)


async def test_lookup_by_canonical_url_and_identity_tuple(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    group = await repo.create_job_group(_job_group())
    posting = await repo.upsert_source_posting(_source_posting())
    await repo.add_posting_to_group(group.id, posting.id)

    by_url = await repo.get_job_group_by_canonical_url(
        "https://jobicy.com/jobs/abc-123"
    )
    by_tuple = await repo.get_job_group_by_identity_tuple(
        "acme",
        "python engineer",
        "são paulo brazil",
        EmploymentType.FULL_TIME,
    )
    missing_location = await repo.get_job_group_by_identity_tuple(
        "acme",
        "python engineer",
        "",
        EmploymentType.FULL_TIME,
    )

    assert by_url is not None
    assert by_url.id == group.id
    assert by_tuple is not None
    assert by_tuple.id == group.id
    assert missing_location is None


async def test_add_posting_to_group_is_idempotent_and_does_not_reassign(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    first_group = await repo.create_job_group(_job_group())
    second_group = await repo.create_job_group(
        _job_group(title="Other", title_comparison_key="other")
    )
    posting = await repo.upsert_source_posting(_source_posting())

    await repo.add_posting_to_group(first_group.id, posting.id)
    await repo.add_posting_to_group(first_group.id, posting.id)
    await repo.add_posting_to_group(second_group.id, posting.id)

    loaded = await repo.get_job_group_by_source_posting("jobicy", "abc-123")
    assert loaded is not None
    assert loaded.id == first_group.id
    assert len(loaded.source_postings) == 1
