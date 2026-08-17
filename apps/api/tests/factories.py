from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import (
    EmploymentType,
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import (
    Compensation,
    EligibleLocation,
    JobGroupInput,
    SourcePostingInput,
    TechnologyTerm,
)


def aware_now() -> datetime:
    return datetime(2026, 8, 16, 23, 30, tzinfo=UTC)


def source_posting_input(**overrides: object) -> SourcePostingInput:
    source_id = str(overrides.get("source_id", "jobicy"))
    posting_id = str(overrides.get("source_posting_id", uuid4()))
    payload: dict[str, object] = {
        "source_id": source_id,
        "source_posting_id": posting_id,
        "source_name": "Jobicy" if source_id == "jobicy" else "Himalayas",
        "application_url": f"https://{source_id}.example/jobs/{posting_id}",
        "application_url_canonical": f"https://{source_id}.example/jobs/{posting_id}",
        "title_original": "Python Engineer",
        "company_original": "Acme Ltd",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "remote_status": RemoteStatus.REMOTE,
        "employment_type": EmploymentType.FULL_TIME,
        "seniority": Seniority.MID,
        "seniority_original": "Mid-level",
        "compensation": Compensation(),
        "technologies_original_text": "Python, FastAPI",
        "location_eligibility_evidence": "Remote in Brazil",
        "published_at": aware_now(),
        "source_timestamp": aware_now(),
        "first_seen_at": aware_now(),
        "last_seen_at": aware_now(),
        "closed_at": None,
        "status": JobStatus.ACTIVE,
        "ingestion_run_id": None,
        "adapter_version": "1.0.0",
        "raw_source_metadata": {"feed": "programming"},
    }
    payload.update(overrides)
    return SourcePostingInput.model_validate(payload)


def job_group_input(**overrides: object) -> JobGroupInput:
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
            original_text="$120000/year",
            currency="USD",
            period="year",
            minimum=Decimal("120000"),
            annual_usd_minimum=Decimal("120000"),
        ),
        "published_at": aware_now(),
        "first_seen_at": aware_now(),
        "last_seen_at": aware_now(),
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


async def persist_job(
    session: AsyncSession,
    *,
    group: JobGroupInput | None = None,
    postings: list[SourcePostingInput] | None = None,
) -> UUID:
    repo = CatalogRepository(session)
    created = await repo.create_job_group(group or job_group_input())
    for posting in postings or [source_posting_input()]:
        saved = await repo.upsert_source_posting(posting)
        await repo.add_posting_to_group(created.id, saved.id)
    await session.commit()
    return created.id
