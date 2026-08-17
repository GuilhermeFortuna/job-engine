from datetime import UTC, datetime
from decimal import Decimal
from typing import Any
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from job_engine.domain.enums import (
    EmploymentType,
    IngestionRunStatus,
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)

# Section 7: original values are stored beside normalized fields so transformed
# meaning stays auditable. Missing compensation amounts are None, never 0.


def _require_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError("datetime must be timezone-aware UTC")
    return value.astimezone(UTC)


def _require_http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be an HTTP or HTTPS URL")
    return value


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class Compensation(FrozenModel):
    original_text: str | None = None
    currency: str | None = None
    period: str | None = None
    minimum: Decimal | None = None
    maximum: Decimal | None = None
    annual_usd_minimum: Decimal | None = None
    annual_usd_maximum: Decimal | None = None


class TechnologyTerm(FrozenModel):
    term: str
    source_text: str | None = None

    @field_validator("term")
    @classmethod
    def term_must_be_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("technology term must be non-empty")
        return stripped


class EligibleLocation(FrozenModel):
    region: LocationEligibilityRegion
    evidence_text: str | None = None


class ErrorSummary(FrozenModel):
    code: str
    message: str


class IngestionRunCompletion(FrozenModel):
    status: IngestionRunStatus
    fetched_count: int = 0
    accepted_count: int = 0
    rejected_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    marked_stale_count: int = 0
    marked_closed_count: int = 0
    error_summaries: tuple[ErrorSummary, ...] = ()

    @field_validator("status")
    @classmethod
    def status_must_be_terminal(cls, value: IngestionRunStatus) -> IngestionRunStatus:
        if value is IngestionRunStatus.RUNNING:
            raise ValueError("completion status cannot be running")
        return value


class IngestionRun(FrozenModel):
    id: UUID
    source_id: str
    adapter_version: str | None = None
    status: IngestionRunStatus
    started_at: datetime
    completed_at: datetime | None = None
    fetched_count: int = 0
    accepted_count: int = 0
    rejected_count: int = 0
    inserted_count: int = 0
    updated_count: int = 0
    marked_stale_count: int = 0
    marked_closed_count: int = 0
    error_summaries: tuple[ErrorSummary, ...] = ()

    @field_validator("started_at", "completed_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class SourcePostingInput(FrozenModel):
    source_id: str
    source_posting_id: str
    source_name: str
    application_url: str
    application_url_canonical: str
    title_original: str
    company_original: str
    description: str | None = None
    location_original: str | None = None
    remote_status: RemoteStatus
    employment_type: EmploymentType
    seniority: Seniority
    seniority_original: str | None = None
    compensation: Compensation = Field(default_factory=Compensation)
    technologies_original_text: str | None = None
    location_eligibility_evidence: str | None = None
    published_at: datetime | None = None
    source_timestamp: datetime | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    closed_at: datetime | None = None
    status: JobStatus
    ingestion_run_id: UUID | None = None
    adapter_version: str | None = None
    raw_source_metadata: dict[str, Any] | None = None

    @field_validator("application_url", "application_url_canonical")
    @classmethod
    def application_url_must_be_http(cls, value: str) -> str:
        return _require_http_url(value)

    @field_validator(
        "published_at",
        "source_timestamp",
        "first_seen_at",
        "last_seen_at",
        "closed_at",
    )
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class SourcePosting(SourcePostingInput):
    id: UUID


class JobGroupInput(FrozenModel):
    title: str
    title_original: str
    title_comparison_key: str
    company: str
    company_original: str
    company_comparison_key: str
    description: str | None = None
    location_original: str | None = None
    location_comparison_key: str = ""
    location_normalized_country: str | None = None
    location_normalized_region: str | None = None
    remote_status: RemoteStatus
    employment_type: EmploymentType
    seniority: Seniority
    seniority_original: str | None = None
    compensation: Compensation = Field(default_factory=Compensation)
    published_at: datetime | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    closed_at: datetime | None = None
    status: JobStatus
    location_eligibility_unknown: bool
    technologies: tuple[TechnologyTerm, ...] = ()
    eligible_locations: tuple[EligibleLocation, ...] = ()
    role_families: tuple[str, ...] = ()
    last_ingestion_run_id: UUID | None = None

    @field_validator(
        "published_at",
        "first_seen_at",
        "last_seen_at",
        "closed_at",
    )
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class JobGroup(JobGroupInput):
    id: UUID
    source_postings: tuple[SourcePosting, ...] = ()
