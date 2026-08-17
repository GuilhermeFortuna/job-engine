from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from job_engine.domain.enums import (
    EmploymentType,
    JobStatus,
    LocationEligibilityRegion,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.taxonomy import REQUIRED_ROLE_FAMILY_IDS

RoleFamilyId = Literal[
    "software_developer",
    "full_stack",
    "backend",
    "python",
    "frontend",
    "ai_application",
    "applied_ai",
]

PostedWithin = Literal["24h", "7d", "30d", "any"]
SortValue = Literal["newest", "compensation_desc"]


class LocationEligibilityFilter(StrEnum):
    BRAZIL = "brazil"
    LATIN_AMERICA = "latin_america"
    WORLDWIDE = "worldwide"
    UNKNOWN = "unknown"


class LatestRunStatus(StrEnum):
    NEVER_RUN = "never_run"
    RUNNING = "running"
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"


class ApiModel(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Compensation(ApiModel):
    original_text: str | None = None
    currency: str | None = None
    period: str | None = None
    minimum: Decimal | None = None
    maximum: Decimal | None = None
    annual_usd_minimum: Decimal | None = None
    annual_usd_maximum: Decimal | None = None

    @field_serializer(
        "minimum",
        "maximum",
        "annual_usd_minimum",
        "annual_usd_maximum",
        when_used="json",
    )
    def serialize_money(self, value: Decimal | None) -> str | None:
        if value is None:
            return None
        return format(value, "f")


class Technology(ApiModel):
    term: str
    source_text: str | None = None


class LocationEligibilityRegionItem(ApiModel):
    region: LocationEligibilityRegion
    evidence_text: str | None = None


class LocationEligibility(ApiModel):
    unknown: bool
    regions: tuple[LocationEligibilityRegionItem, ...] = ()


class SourceSummary(ApiModel):
    source_id: str
    source_name: str
    application_url: str


class SourcePostingDetail(ApiModel):
    id: UUID
    source_id: str
    source_posting_id: str
    source_name: str
    application_url: str
    title_original: str
    company_original: str
    description: str | None = None
    location_original: str | None = None
    remote_status: RemoteStatus
    employment_type: EmploymentType
    seniority: Seniority
    seniority_original: str | None = None
    compensation: Compensation
    technologies_original_text: str | None = None
    location_eligibility_evidence: str | None = None
    published_at: datetime | None = None
    source_timestamp: datetime | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    closed_at: datetime | None = None
    status: JobStatus
    adapter_version: str | None = None
    linked_at: datetime


class JobCardBase(ApiModel):
    id: UUID
    title: str
    title_original: str
    company: str
    company_original: str
    location_original: str | None = None
    location_normalized_country: str | None = None
    location_normalized_region: str | None = None
    remote_status: RemoteStatus
    location_eligibility: LocationEligibility
    seniority: Seniority
    seniority_original: str | None = None
    employment_type: EmploymentType
    compensation: Compensation
    technologies: tuple[Technology, ...] = ()
    role_families: tuple[str, ...] = ()
    published_at: datetime | None = None
    first_seen_at: datetime
    last_seen_at: datetime
    sources: tuple[SourceSummary, ...] = ()
    primary_application_url: str | None = None


class JobListItem(JobCardBase):
    description_excerpt: str | None = None


class JobDetail(JobCardBase):
    description: str | None = None
    status: JobStatus
    closed_at: datetime | None = None
    source_postings: tuple[SourcePostingDetail, ...] = ()


class JobSearchResponse(ApiModel):
    items: tuple[JobListItem, ...]
    page: int
    page_size: int
    total: int
    total_pages: int


class FilterOption(ApiModel):
    value: str
    label: str


class RoleFamilyOption(ApiModel):
    id: str
    label: str


class SourceOption(ApiModel):
    id: str
    label: str


class CatalogFilters(ApiModel):
    role_families: tuple[RoleFamilyOption, ...]
    technologies: tuple[FilterOption, ...]
    remote_status: tuple[FilterOption, ...]
    location_eligibility: tuple[FilterOption, ...]
    seniority: tuple[FilterOption, ...]
    posted_within: tuple[FilterOption, ...]
    sort: tuple[FilterOption, ...]
    sources: tuple[SourceOption, ...]


class SourceHealth(ApiModel):
    source_id: str
    latest_run_status: LatestRunStatus
    latest_run_started_at: datetime | None = None
    latest_run_completed_at: datetime | None = None
    fetched_count: int | None = None
    accepted_count: int | None = None
    rejected_count: int | None = None


class CatalogHealth(ApiModel):
    catalog_last_seen_at: datetime | None = None
    sources: tuple[SourceHealth, ...]


class JobSearchQuery(BaseModel):
    model_config = ConfigDict(extra="forbid")

    q: str | None = None
    role_family: list[RoleFamilyId] = Field(default_factory=list)
    technology: list[str] = Field(default_factory=list)
    remote_status: list[RemoteStatus] = Field(default_factory=list)
    location_eligibility: list[LocationEligibilityFilter] = Field(default_factory=list)
    seniority: list[Seniority] = Field(default_factory=list)
    source: list[str] = Field(default_factory=list)
    minimum_annual_usd: Decimal | None = Field(default=None, ge=0)
    include_unknown_compensation: bool = True
    posted_within: PostedWithin = "any"
    sort: SortValue = "newest"
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=25, ge=1, le=100)

    @field_validator("q")
    @classmethod
    def blank_q_is_none(cls, value: str | None) -> str | None:
        if value is None:
            return None
        stripped = value.strip()
        return stripped or None

    @field_validator("technology")
    @classmethod
    def technology_must_be_canonical(cls, value: list[str]) -> list[str]:
        allowed = canonical_technology_terms()
        for item in value:
            if item not in allowed:
                raise ValueError(f"unsupported technology: {item}")
        return value

    @field_validator("role_family")
    @classmethod
    def role_family_must_be_known(cls, value: list[RoleFamilyId]) -> list[RoleFamilyId]:
        allowed = set(REQUIRED_ROLE_FAMILY_IDS)
        for item in value:
            if item not in allowed:
                raise ValueError(f"unsupported role_family: {item}")
        return value


_CANONICAL_TECHNOLOGY_TERMS: tuple[str, ...] | None = None


def canonical_technology_terms() -> tuple[str, ...]:
    global _CANONICAL_TECHNOLOGY_TERMS
    if _CANONICAL_TECHNOLOGY_TERMS is None:
        from importlib import resources
        from json import loads

        payload = loads(
            resources.files("job_engine.data")
            .joinpath("technology_aliases.json")
            .read_text(encoding="utf-8")
        )
        terms = payload["canonical_terms"]
        if not isinstance(terms, list) or not terms:
            raise RuntimeError("canonical_terms must be a non-empty list")
        _CANONICAL_TECHNOLOGY_TERMS = tuple(str(term) for term in terms)
    return _CANONICAL_TECHNOLOGY_TERMS
