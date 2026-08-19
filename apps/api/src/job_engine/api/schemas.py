from datetime import datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_serializer, field_validator

from job_engine.domain.applicant import (
    FieldDiffStatus,
    FieldSource,
    PolicyCategory,
    QuestionIntent,
    ValueState,
)
from job_engine.domain.application_answers import (
    AnswerDecisionType,
    ControlType,
    ReasonCode,
)
from job_engine.domain.applications import (
    ApplicationRunStatus,
    AutomationMode,
    EvidenceType,
    ExceptionStatus,
    ExceptionType,
    RunCheckpoint,
    RunnerReleaseReason,
)
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


class SyncStage(StrEnum):
    FETCHING = "fetching"
    NORMALIZING = "normalizing"
    PERSISTING = "persisting"


class SyncSourceStatus(StrEnum):
    SUCCESS = "success"
    PARTIAL_SUCCESS = "partial_success"
    FAILURE = "failure"


class SyncStartedEvent(ApiModel):
    sources: tuple[str, ...]
    started_at: datetime


class SyncSourceProgressEvent(ApiModel):
    source_id: str
    stage: SyncStage
    fetched_count: int
    accepted_count: int
    rejected_count: int


class SyncErrorSummary(ApiModel):
    code: str
    message: str


class SyncSourceCompletedEvent(ApiModel):
    source_id: str
    status: SyncSourceStatus
    inserted_count: int
    updated_count: int
    marked_stale_count: int
    error_summaries: tuple[SyncErrorSummary, ...] = ()


class SyncCompletedEvent(ApiModel):
    status: SyncSourceStatus
    total_inserted: int
    total_updated: int
    total_stale: int
    completed_at: datetime


# --- Applicant Data Vault Schemas (BACK-009) ---


class EmploymentEntrySchema(ApiModel):
    id: UUID
    company: str
    title: str
    location: str | None = None
    start_date: str
    end_date: str | None = None
    is_current: bool = False
    responsibilities: tuple[str, ...] = ()
    technologies: tuple[str, ...] = ()


class EducationEntrySchema(ApiModel):
    id: UUID
    institution: str
    degree: str
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    location: str | None = None


class CertificationEntrySchema(ApiModel):
    id: UUID
    name: str
    issuer: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None
    credential_id: str | None = None
    credential_url: str | None = None


class LanguageProficiencySchema(ApiModel):
    id: UUID
    language: str
    proficiency: str


class WorkAuthorizationSchema(ApiModel):
    id: UUID
    jurisdiction: str
    authorized: bool
    requires_sponsorship: bool
    notes: str | None = None
    provenance: str = "owner_authored"
    last_confirmed_at: datetime


class CompensationExpectationSchema(ApiModel):
    currency: str = "USD"
    minimum_annual: Decimal | None = None
    target_annual: Decimal | None = None
    period: str = "annual"
    notes: str | None = None
    last_confirmed_at: datetime


class LocationPreferencesSchema(ApiModel):
    current_city: str
    current_region: str
    current_country: str
    timezone: str | None = None
    remote_preference: str = "remote_only"
    will_relocate: bool = False
    travel_percentage: int = 0


class DemographicPreferencesSchema(ApiModel):
    gender: str | None = None
    race_ethnicity: str | None = None
    veteran_status: str | None = None
    disability_status: str | None = None
    decline_all_optional: bool = True


class ConfirmedFieldSchema[T](ApiModel):
    state: ValueState = ValueState.UNKNOWN
    value: T | None = None
    source: FieldSource | None = None
    last_confirmed_at: datetime | None = None
    policy_category: PolicyCategory = PolicyCategory.VERIFIED_PROFILE


class ApplicantProfileRead(ApiModel):
    id: UUID
    version: int
    created_at: datetime
    updated_at: datetime
    first_name: ConfirmedFieldSchema[str]
    last_name: ConfirmedFieldSchema[str]
    email: ConfirmedFieldSchema[str]
    phone: ConfirmedFieldSchema[str]
    city: ConfirmedFieldSchema[str]
    region: ConfirmedFieldSchema[str]
    country: ConfirmedFieldSchema[str]
    timezone: ConfirmedFieldSchema[str]
    headline: ConfirmedFieldSchema[str]
    summary: ConfirmedFieldSchema[str]
    portfolio_url: ConfirmedFieldSchema[str]
    linkedin_url: ConfirmedFieldSchema[str]
    github_url: ConfirmedFieldSchema[str]
    custom_urls: ConfirmedFieldSchema[dict[str, str]]
    notice_period_days: ConfirmedFieldSchema[int]
    employment_history: ConfirmedFieldSchema[tuple[EmploymentEntrySchema, ...]]
    education_history: ConfirmedFieldSchema[tuple[EducationEntrySchema, ...]]
    skills: ConfirmedFieldSchema[tuple[str, ...]]
    languages: ConfirmedFieldSchema[tuple[LanguageProficiencySchema, ...]]
    certifications: ConfirmedFieldSchema[tuple[CertificationEntrySchema, ...]]
    work_authorizations: ConfirmedFieldSchema[tuple[WorkAuthorizationSchema, ...]]
    compensation_expectation: ConfirmedFieldSchema[CompensationExpectationSchema]
    location_preferences: ConfirmedFieldSchema[LocationPreferencesSchema]
    demographics: ConfirmedFieldSchema[DemographicPreferencesSchema]


class ApplicantProfileUpsertRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int | None = None
    first_name: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    last_name: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    email: ConfirmedFieldSchema[str] = Field(default_factory=ConfirmedFieldSchema[str])
    phone: ConfirmedFieldSchema[str] = Field(default_factory=ConfirmedFieldSchema[str])
    city: ConfirmedFieldSchema[str] = Field(default_factory=ConfirmedFieldSchema[str])
    region: ConfirmedFieldSchema[str] = Field(default_factory=ConfirmedFieldSchema[str])
    country: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    timezone: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    headline: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    summary: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    portfolio_url: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    linkedin_url: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    github_url: ConfirmedFieldSchema[str] = Field(
        default_factory=ConfirmedFieldSchema[str]
    )
    custom_urls: ConfirmedFieldSchema[dict[str, str]] = Field(
        default_factory=ConfirmedFieldSchema[dict[str, str]]
    )
    notice_period_days: ConfirmedFieldSchema[int] = Field(
        default_factory=ConfirmedFieldSchema[int]
    )
    employment_history: ConfirmedFieldSchema[tuple[EmploymentEntrySchema, ...]] = Field(
        default_factory=ConfirmedFieldSchema[tuple[EmploymentEntrySchema, ...]]
    )
    education_history: ConfirmedFieldSchema[tuple[EducationEntrySchema, ...]] = Field(
        default_factory=ConfirmedFieldSchema[tuple[EducationEntrySchema, ...]]
    )
    skills: ConfirmedFieldSchema[tuple[str, ...]] = Field(
        default_factory=ConfirmedFieldSchema[tuple[str, ...]]
    )
    languages: ConfirmedFieldSchema[tuple[LanguageProficiencySchema, ...]] = Field(
        default_factory=ConfirmedFieldSchema[tuple[LanguageProficiencySchema, ...]]
    )
    certifications: ConfirmedFieldSchema[tuple[CertificationEntrySchema, ...]] = Field(
        default_factory=ConfirmedFieldSchema[tuple[CertificationEntrySchema, ...]]
    )
    work_authorizations: ConfirmedFieldSchema[tuple[WorkAuthorizationSchema, ...]] = (
        Field(default_factory=ConfirmedFieldSchema[tuple[WorkAuthorizationSchema, ...]])
    )
    compensation_expectation: ConfirmedFieldSchema[CompensationExpectationSchema] = (
        Field(default_factory=ConfirmedFieldSchema[CompensationExpectationSchema])
    )
    location_preferences: ConfirmedFieldSchema[LocationPreferencesSchema] = Field(
        default_factory=ConfirmedFieldSchema[LocationPreferencesSchema]
    )
    demographics: ConfirmedFieldSchema[DemographicPreferencesSchema] = Field(
        default_factory=ConfirmedFieldSchema[DemographicPreferencesSchema]
    )


class ResumeImportRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_markdown_path: str


class ProfileFieldDiffSchema(ApiModel):
    field_path: str
    status: FieldDiffStatus
    current_value: Any = None
    proposed_value: Any = None
    message: str | None = None


class ResumeImportProposalResponse(ApiModel):
    source_markdown_path: str
    generated_at: datetime
    diffs: tuple[ProfileFieldDiffSchema, ...]


class ResumeAssetRead(ApiModel):
    id: UUID
    resume_id: str
    label: str
    source_markdown_path: str
    upload_pdf_path: str
    preview_html_path: str | None = None
    sha256: str
    language: str
    is_default: bool
    file_size_bytes: int | None = None
    last_verified_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class ResumeListResponse(ApiModel):
    items: tuple[ResumeAssetRead, ...]


class ResumeAssetCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    resume_id: str
    label: str
    source_markdown_path: str
    upload_pdf_path: str
    preview_html_path: str | None = None
    language: str = "en"
    is_default: bool = False


class ResumeAssetPatchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int
    label: str | None = None
    is_default: bool | None = None
    refresh_checksum: bool = False


class ReusableAnswerRead(ApiModel):
    id: UUID
    answer_id: str
    question_intent: QuestionIntent
    jurisdiction: str | None = None
    platform_scope: str | None = None
    answer_text: str
    policy_category: PolicyCategory
    provenance: str
    last_confirmed_at: datetime
    expires_at: datetime | None = None
    version: int
    created_at: datetime
    updated_at: datetime


class AnswerBankListResponse(ApiModel):
    items: tuple[ReusableAnswerRead, ...]


class ReusableAnswerCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    answer_id: str
    question_intent: QuestionIntent
    jurisdiction: str | None = None
    platform_scope: str | None = None
    answer_text: str
    policy_category: PolicyCategory
    provenance: str = "owner_authored"
    last_confirmed_at: datetime
    expires_at: datetime | None = None


class ReusableAnswerUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expected_version: int
    question_intent: QuestionIntent
    jurisdiction: str | None = None
    platform_scope: str | None = None
    answer_text: str
    policy_category: PolicyCategory
    provenance: str = "owner_authored"
    last_confirmed_at: datetime
    expires_at: datetime | None = None


# --- Application Orchestration Schemas (BACK-010) ---


class DuplicateOverrideInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_confirmation: str = Field(min_length=1, max_length=500)
    reason: str = Field(min_length=1, max_length=1000)


class ApplicationRunCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    job_group_ids: list[UUID] = Field(min_length=1, max_length=25)
    resume_id: str | None = None
    # Deliberately required and un-defaulted. A default of FULL_AUTO meant any
    # caller that simply omitted the field silently created an unattended run
    # (CROSS-009 advisory A-1). Callers must now state the mode they intend.
    automation_mode: AutomationMode


class ApplicationRunConflictItem(ApiModel):
    job_group_id: UUID
    canonical_application_url: str
    existing_run_id: UUID
    existing_status: ApplicationRunStatus
    message: str


class ApplicationRunReceiptRead(ApiModel):
    platform_adapter_id: str
    final_url: str | None = None
    platform_receipt_id: str | None = None
    confirmation_signal: str
    capture_timestamp: datetime
    artifact_hash: str
    summary_notes: str | None = None


class ApplicationRunEventRead(ApiModel):
    id: UUID
    run_id: UUID
    attempt: int
    sequence_num: int
    event_type: str
    event_payload: dict[str, Any]
    idempotency_key: str | None = None
    created_at: datetime


class ApplicationExceptionFieldRead(ApiModel):
    field_fingerprint: str
    label: str
    control_type: ControlType
    required: bool
    status: str
    reason_code: str | None = None
    question_intent: QuestionIntent | None = None
    options: tuple[str, ...] = ()
    min_length: int | None = None
    max_length: int | None = None
    pattern: str | None = None
    allow_save_to_answer_bank: bool = False


class ApplicationExceptionRead(ApiModel):
    id: UUID
    run_id: UUID
    exception_type: ExceptionType
    status: ExceptionStatus
    context_payload: dict[str, Any]
    field_reports: tuple[ApplicationExceptionFieldRead, ...] = ()
    resolution_payload: dict[str, Any] | None = None
    created_at: datetime
    resolved_at: datetime | None = None


class EvidenceArtifactRead(ApiModel):
    id: UUID
    run_id: UUID
    attempt: int
    evidence_type: EvidenceType
    relative_path: str
    sha256: str
    file_size_bytes: int | None = None
    captured_at: datetime
    metadata_payload: dict[str, Any] | None = None


class ApplicationRunRead(ApiModel):
    id: UUID
    job_group_id: UUID
    source_posting_id: UUID | None = None
    canonical_application_url: str
    application_url: str
    platform_adapter_id: str
    resume_asset_id: UUID
    resume_sha256: str
    applicant_profile_version: int
    answer_bank_snapshot: dict[str, int]
    answer_bank_hash: str
    automation_mode: AutomationMode
    status: ApplicationRunStatus
    current_step: str | None = None
    current_checkpoint: str | None = None
    submit_attempted_at: datetime | None = None
    attempt_count: int
    retry_failure_count: int
    max_retries: int
    idempotency_key: str
    terminal_reason: str | None = None
    receipt_summary: ApplicationRunReceiptRead | None = None
    policy_snapshot: dict[str, Any] | None = None
    duplicate_override_confirmed_at: datetime | None = None
    duplicate_override_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None


class ApplicationRunDetailRead(ApplicationRunRead):
    events: tuple[ApplicationRunEventRead, ...] = ()
    exceptions: tuple[ApplicationExceptionRead, ...] = ()
    evidence: tuple[EvidenceArtifactRead, ...] = ()


class ApplicationRunCreateResponse(ApiModel):
    created_runs: tuple[ApplicationRunRead, ...]
    conflicts: tuple[ApplicationRunConflictItem, ...] = ()


class ApplicationRunListResponse(ApiModel):
    items: tuple[ApplicationRunRead, ...]
    total: int
    page: int
    page_size: int
    total_pages: int


class ResolveAnswerItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    field_fingerprint: str = Field(min_length=1, max_length=256)
    answer_text: str = Field(min_length=1, max_length=10_000)
    save_to_answer_bank: bool = False
    jurisdiction: str | None = None
    platform_scope: str | None = None


class ResolveAnswersRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exception_id: UUID
    answers: list[ResolveAnswerItem]


class ReleaseSubmitRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_confirmation: str


class CancelRunRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: str | None = None


class DuplicateOverrideRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_confirmation: str
    reason: str


# --- Runner-facing schemas ---


class RunnerClaimResponse(ApiModel):
    run: ApplicationRunRead
    lease_token: str
    grant_token: str
    lease_expires_at: datetime


class RunnerClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    run_id: UUID | None = None
    """Claim exactly this run, or nothing. Omit for oldest-queued behavior."""


class RunnerReleaseClaimRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    reason: RunnerReleaseReason


class RunnerHeartbeatRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    extend_seconds: int = Field(default=60, ge=10, le=300)


class RunnerEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attempt: int = Field(ge=1)
    sequence_num: int = Field(ge=1)
    event_type: str
    event_payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None


class RunnerCheckpointRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    checkpoint: RunCheckpoint | str
    step_description: str | None = None


class RunnerExceptionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exception_type: ExceptionType
    context_payload: dict[str, Any] = Field(default_factory=dict)


class RunnerCompleteRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    terminal_status: ApplicationRunStatus
    terminal_reason: str | None = None
    receipt: ApplicationRunReceiptRead | None = None


class EvidenceUploadResponse(ApiModel):
    id: UUID
    relative_path: str
    sha256: str
    file_size_bytes: int


# --- Grounded Application Answering Schemas (BACK-011) ---


class ObservationValidationConstraintsSchema(ApiModel):
    min_length: int | None = None
    max_length: int | None = None
    pattern: str | None = None


class QuestionObservationSchema(BaseModel):
    model_config = ConfigDict(extra="forbid")

    adapter_id: str
    page_id: str
    field_fingerprint: str
    label: str
    accessible_name: str | None = None
    help_text: str | None = None
    required: bool
    control_type: ControlType
    options: tuple[str, ...] = ()
    validation_constraints: ObservationValidationConstraintsSchema | None = None


class AnswerDecisionRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    observations: tuple[QuestionObservationSchema, ...]


class EvidenceReferenceSchema(ApiModel):
    source: Literal["profile", "resume", "answer_bank", "job", "owner_resolution"]
    reference: str


class AnswerDecisionSchema(ApiModel):
    field_fingerprint: str
    decision: AnswerDecisionType
    answer: str | None = None
    policy_category: PolicyCategory
    confidence: float
    evidence: tuple[EvidenceReferenceSchema, ...] = ()
    reason_code: ReasonCode
    question_intent: QuestionIntent | None = None


class AnswerDecisionResponse(ApiModel):
    decisions: tuple[AnswerDecisionSchema, ...]
