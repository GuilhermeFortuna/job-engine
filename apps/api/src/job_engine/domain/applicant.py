from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any, Self
from urllib.parse import urlparse
from uuid import UUID, uuid4

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


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


class PolicyCategory(StrEnum):
    VERIFIED_PROFILE = "verified_profile"
    APPROVED_REUSABLE = "approved_reusable"
    GROUNDED_GENERATED = "grounded_generated"
    REVIEW_REQUIRED = "review_required"
    DECLINE_OPTIONAL = "decline_optional"
    PROHIBITED_AUTOMATION = "prohibited_automation"


class ValueState(StrEnum):
    UNKNOWN = "unknown"
    PROVIDED = "provided"
    DECLINED = "declined"


class FieldSource(StrEnum):
    OWNER = "owner"
    RESUME_IMPORT = "resume_import"


class QuestionIntent(StrEnum):
    WORK_AUTHORIZATION = "work_authorization"
    SPONSORSHIP_REQUIRED = "sponsorship_required"
    NOTICE_PERIOD = "notice_period"
    AVAILABILITY_DATE = "availability_date"
    COMPENSATION_EXPECTATION = "compensation_expectation"
    LOCATION_PREFERENCE = "location_preference"
    RELOCATION = "relocation"
    TRAVEL = "travel"
    GENDER = "gender"
    RACE_ETHNICITY = "race_ethnicity"
    VETERAN_STATUS = "veteran_status"
    DISABILITY_STATUS = "disability_status"
    LEGAL_ATTESTATION = "legal_attestation"
    BACKGROUND_CHECK_CONSENT = "background_check_consent"
    ARBITRATION_CONSENT = "arbitration_consent"
    PRIVACY_CONSENT = "privacy_consent"
    EXPORT_CONTROL = "export_control"
    CONFLICT_OF_INTEREST = "conflict_of_interest"
    SIGNATURE = "signature"
    NARRATIVE = "narrative"


class FieldDiffStatus(StrEnum):
    ADDED = "added"
    MODIFIED = "modified"
    UNCHANGED = "unchanged"
    CONFLICT = "conflict"


LEGAL_CONSENT_INTENTS: frozenset[QuestionIntent] = frozenset(
    {
        QuestionIntent.LEGAL_ATTESTATION,
        QuestionIntent.BACKGROUND_CHECK_CONSENT,
        QuestionIntent.ARBITRATION_CONSENT,
        QuestionIntent.PRIVACY_CONSENT,
        QuestionIntent.EXPORT_CONTROL,
        QuestionIntent.CONFLICT_OF_INTEREST,
        QuestionIntent.SIGNATURE,
    }
)

DEMOGRAPHIC_INTENTS: frozenset[QuestionIntent] = frozenset(
    {
        QuestionIntent.GENDER,
        QuestionIntent.RACE_ETHNICITY,
        QuestionIntent.VETERAN_STATUS,
        QuestionIntent.DISABILITY_STATUS,
    }
)


class ConfirmedField[T](FrozenModel):
    state: ValueState = ValueState.UNKNOWN
    value: T | None = None
    source: FieldSource | None = None
    last_confirmed_at: datetime | None = None
    policy_category: PolicyCategory = PolicyCategory.VERIFIED_PROFILE

    @model_validator(mode="after")
    def validate_envelope(self) -> Self:
        if self.last_confirmed_at is not None:
            object.__setattr__(
                self, "last_confirmed_at", _require_aware_utc(self.last_confirmed_at)
            )

        if self.state == ValueState.PROVIDED:
            if self.value is None:
                raise ValueError("PROVIDED state requires a non-None value")
            if self.source is None:
                raise ValueError("PROVIDED state requires a source")
            if self.last_confirmed_at is None:
                raise ValueError("PROVIDED state requires last_confirmed_at timestamp")
        elif self.state == ValueState.UNKNOWN:
            if self.value is not None:
                raise ValueError("UNKNOWN state requires value to be None")
            if self.source is not None:
                raise ValueError("UNKNOWN state requires source to be None")
            if self.last_confirmed_at is not None:
                raise ValueError("UNKNOWN state requires last_confirmed_at to be None")
        elif self.state == ValueState.DECLINED:
            if self.value is not None:
                raise ValueError("DECLINED state requires value to be None")
            if self.source != FieldSource.OWNER:
                raise ValueError("DECLINED state requires source to be OWNER")
            if self.last_confirmed_at is None:
                raise ValueError("DECLINED state requires last_confirmed_at timestamp")
        return self


class EmploymentEntry(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    company: str
    title: str
    location: str | None = None
    start_date: str
    end_date: str | None = None
    is_current: bool = False
    responsibilities: tuple[str, ...] = ()
    technologies: tuple[str, ...] = ()


class EducationEntry(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    institution: str
    degree: str
    field_of_study: str | None = None
    start_date: str | None = None
    end_date: str | None = None
    location: str | None = None


class CertificationEntry(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    name: str
    issuer: str | None = None
    issue_date: str | None = None
    expiry_date: str | None = None
    credential_id: str | None = None
    credential_url: str | None = None


class LanguageProficiency(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    language: str
    proficiency: str


class WorkAuthorization(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    jurisdiction: str
    authorized: bool
    requires_sponsorship: bool
    notes: str | None = None
    provenance: str = "owner_authored"
    last_confirmed_at: datetime

    @field_validator("last_confirmed_at")
    @classmethod
    def validate_last_confirmed_at(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)


class CompensationExpectation(FrozenModel):
    currency: str = "USD"
    minimum_annual: Decimal | None = None
    target_annual: Decimal | None = None
    period: str = "annual"
    notes: str | None = None
    last_confirmed_at: datetime

    @field_validator("last_confirmed_at")
    @classmethod
    def validate_last_confirmed_at(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)


class LocationPreferences(FrozenModel):
    current_city: str
    current_region: str
    current_country: str
    timezone: str | None = None
    remote_preference: str = "remote_only"
    will_relocate: bool = False
    travel_percentage: int = 0


class DemographicPreferences(FrozenModel):
    gender: str | None = None
    race_ethnicity: str | None = None
    veteran_status: str | None = None
    disability_status: str | None = None
    decline_all_optional: bool = True


class ApplicantProfileInput(FrozenModel):
    first_name: ConfirmedField[str] = Field(
        default_factory=lambda: ConfirmedField[str]()
    )
    last_name: ConfirmedField[str] = Field(
        default_factory=lambda: ConfirmedField[str]()
    )
    email: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    phone: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    city: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    region: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    country: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    timezone: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    headline: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    summary: ConfirmedField[str] = Field(default_factory=lambda: ConfirmedField[str]())
    portfolio_url: ConfirmedField[str] = Field(
        default_factory=lambda: ConfirmedField[str]()
    )
    linkedin_url: ConfirmedField[str] = Field(
        default_factory=lambda: ConfirmedField[str]()
    )
    github_url: ConfirmedField[str] = Field(
        default_factory=lambda: ConfirmedField[str]()
    )
    custom_urls: ConfirmedField[dict[str, str]] = Field(
        default_factory=lambda: ConfirmedField[dict[str, str]]()
    )
    notice_period_days: ConfirmedField[int] = Field(
        default_factory=lambda: ConfirmedField[int]()
    )
    employment_history: ConfirmedField[tuple[EmploymentEntry, ...]] = Field(
        default_factory=lambda: ConfirmedField[tuple[EmploymentEntry, ...]]()
    )
    education_history: ConfirmedField[tuple[EducationEntry, ...]] = Field(
        default_factory=lambda: ConfirmedField[tuple[EducationEntry, ...]]()
    )
    skills: ConfirmedField[tuple[str, ...]] = Field(
        default_factory=lambda: ConfirmedField[tuple[str, ...]]()
    )
    languages: ConfirmedField[tuple[LanguageProficiency, ...]] = Field(
        default_factory=lambda: ConfirmedField[tuple[LanguageProficiency, ...]]()
    )
    certifications: ConfirmedField[tuple[CertificationEntry, ...]] = Field(
        default_factory=lambda: ConfirmedField[tuple[CertificationEntry, ...]]()
    )
    work_authorizations: ConfirmedField[tuple[WorkAuthorization, ...]] = Field(
        default_factory=lambda: ConfirmedField[tuple[WorkAuthorization, ...]]()
    )
    compensation_expectation: ConfirmedField[CompensationExpectation] = Field(
        default_factory=lambda: ConfirmedField[CompensationExpectation]()
    )
    location_preferences: ConfirmedField[LocationPreferences] = Field(
        default_factory=lambda: ConfirmedField[LocationPreferences]()
    )
    demographics: ConfirmedField[DemographicPreferences] = Field(
        default_factory=lambda: ConfirmedField[DemographicPreferences]()
    )


class ApplicantProfile(ApplicantProfileInput):
    id: UUID = Field(default_factory=uuid4)
    version: int = 1
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)


class ResumeAssetInput(FrozenModel):
    resume_id: str
    label: str
    source_markdown_path: str
    upload_pdf_path: str
    preview_html_path: str | None = None
    language: str = "en"
    is_default: bool = False

    @field_validator("resume_id")
    @classmethod
    def validate_resume_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("resume_id must be non-empty")
        return stripped


class ResumeAsset(ResumeAssetInput):
    id: UUID = Field(default_factory=uuid4)
    sha256: str
    file_size_bytes: int | None = None
    last_verified_at: datetime | None = None
    version: int = 1
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at", "last_verified_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)

    @field_validator("sha256")
    @classmethod
    def validate_sha256(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if len(cleaned) != 64 or not all(c in "0123456789abcdef" for c in cleaned):
            raise ValueError("sha256 must be a 64-character lowercase hex string")
        return cleaned


class ReusableAnswerInput(FrozenModel):
    answer_id: str
    question_intent: QuestionIntent
    jurisdiction: str | None = None
    platform_scope: str | None = None
    answer_text: str
    policy_category: PolicyCategory
    provenance: str = "owner_authored"
    last_confirmed_at: datetime
    expires_at: datetime | None = None

    @field_validator("answer_id")
    @classmethod
    def validate_answer_id(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("answer_id must be non-empty")
        return stripped

    @field_validator("last_confirmed_at", "expires_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)

    @model_validator(mode="after")
    def validate_policy_and_intent(self) -> Self:
        if self.question_intent in LEGAL_CONSENT_INTENTS:
            if self.policy_category not in {
                PolicyCategory.REVIEW_REQUIRED,
                PolicyCategory.PROHIBITED_AUTOMATION,
            }:
                raise ValueError(
                    f"Intent {self.question_intent.value} is legal/consent and "
                    "may only use review_required or prohibited_automation, "
                    f"got {self.policy_category.value}"
                )
        if (
            self.policy_category == PolicyCategory.DECLINE_OPTIONAL
            and self.question_intent not in DEMOGRAPHIC_INTENTS
        ):
            raise ValueError(
                "decline_optional policy is only valid for demographic "
                f"intents, got {self.question_intent.value}"
            )
        return self


class ReusableAnswer(ReusableAnswerInput):
    id: UUID = Field(default_factory=uuid4)
    version: int = 1
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def row_timestamps_must_be_utc(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)

    def is_expired(self, at: datetime | None = None) -> bool:
        if self.expires_at is None:
            return False
        ref = at if at is not None else datetime.now(UTC)
        return ref >= self.expires_at


class ProfileFieldDiff(FrozenModel):
    field_path: str
    status: FieldDiffStatus
    current_value: Any = None
    proposed_value: Any = None
    message: str | None = None


class ResumeImportProposal(FrozenModel):
    source_markdown_path: str
    generated_at: datetime
    diffs: tuple[ProfileFieldDiff, ...]
    proposed_profile: ApplicantProfileInput

    @field_validator("generated_at")
    @classmethod
    def validate_generated_at(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)
