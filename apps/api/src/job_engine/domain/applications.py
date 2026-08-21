from __future__ import annotations

import hashlib
import json
import re
from datetime import UTC, datetime
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


class ApplicationRunStatus(StrEnum):
    QUEUED = "queued"
    CLAIMED = "claimed"
    RUNNING = "running"
    NEEDS_INPUT = "needs_input"
    PAUSED_AUTH = "paused_auth"
    FAILED_RETRYABLE = "failed_retryable"
    FAILED_FINAL = "failed_final"
    SUBMISSION_UNKNOWN = "submission_unknown"
    SUBMITTED = "submitted"
    CANCELLED = "cancelled"


class AutomationMode(StrEnum):
    FULL_AUTO = "full_auto"
    SEMI_AUTO_PAUSE_BEFORE_SUBMIT = "semi_auto_pause_before_submit"


FULL_AUTO_OWNER_CONFIRMATION = "Authorize automatic submission for these selected jobs"


class RunCheckpoint(StrEnum):
    FORM_DISCOVERED = "form_discovered"
    PROFILE_FILLED = "profile_filled"
    QUESTIONS_ANSWERED = "questions_answered"
    RESUME_ATTACHED = "resume_attached"
    SUBMIT_ARMED = "submit_armed"
    SUBMITTING = "submitting"
    SUBMITTED = "submitted"


class ExceptionType(StrEnum):
    MISSING_PROFILE_FIELD = "missing_profile_field"
    UNRESOLVED_QUESTION = "unresolved_question"
    REVIEW_REQUIRED = "review_required"
    AUTH_REQUIRED = "auth_required"
    CAPTCHA_REQUIRED = "captcha_required"
    SEMI_AUTO_ARMED = "semi_auto_armed"
    STEP_ERROR = "step_error"


class ExceptionStatus(StrEnum):
    PENDING = "pending"
    RESOLVED = "resolved"
    CANCELLED = "cancelled"


class RunnerReleaseReason(StrEnum):
    """Why a runner relinquished a claim before performing any work."""

    UNSUPPORTED_AUTOMATION_MODE = "unsupported_automation_mode"
    RUN_NOT_SELECTED = "run_not_selected"
    RUNTIME_UNAVAILABLE = "runtime_unavailable"


class EvidenceType(StrEnum):
    SCREENSHOT = "screenshot"
    DOM_SNAPSHOT = "dom_snapshot"
    RECEIPT = "receipt"
    LOG = "log"


class AuditEventType(StrEnum):
    RUN_CREATED = "run_created"
    AUTOMATIC_SUBMISSION_AUTHORIZED = "automatic_submission_authorized"
    LEASE_CLAIMED = "lease_claimed"
    LEASE_EXTENDED = "lease_extended"
    LEASE_EXPIRED = "lease_expired"
    LEASE_RELEASED = "lease_released"
    STATUS_CHANGED = "status_changed"
    CHECKPOINT_REACHED = "checkpoint_reached"
    STEP_PROGRESS = "step_progress"
    EXCEPTION_RAISED = "exception_raised"
    EXCEPTION_RESOLVED = "exception_resolved"
    RESUME_ASSET_GRANTED = "resume_asset_granted"
    RESUME_ASSET_RETRIEVED = "resume_asset_retrieved"
    DUPLICATE_OVERRIDE = "duplicate_override"
    SUBMIT_RELEASED = "submit_released"
    RUN_CANCELLED = "run_cancelled"
    RUN_COMPLETED = "run_completed"


TERMINAL_STATUSES: frozenset[ApplicationRunStatus] = frozenset(
    {
        ApplicationRunStatus.SUBMITTED,
        ApplicationRunStatus.SUBMISSION_UNKNOWN,
        ApplicationRunStatus.FAILED_FINAL,
        ApplicationRunStatus.CANCELLED,
    }
)

ACTIVE_STATUSES: frozenset[ApplicationRunStatus] = frozenset(
    {
        ApplicationRunStatus.QUEUED,
        ApplicationRunStatus.CLAIMED,
        ApplicationRunStatus.RUNNING,
        ApplicationRunStatus.NEEDS_INPUT,
        ApplicationRunStatus.PAUSED_AUTH,
        ApplicationRunStatus.FAILED_RETRYABLE,
    }
)

VALID_TRANSITIONS: dict[ApplicationRunStatus, frozenset[ApplicationRunStatus]] = {
    ApplicationRunStatus.QUEUED: frozenset(
        {
            ApplicationRunStatus.CLAIMED,
            ApplicationRunStatus.CANCELLED,
        }
    ),
    ApplicationRunStatus.CLAIMED: frozenset(
        {
            ApplicationRunStatus.RUNNING,
            ApplicationRunStatus.QUEUED,
            ApplicationRunStatus.FAILED_RETRYABLE,
            ApplicationRunStatus.FAILED_FINAL,
            ApplicationRunStatus.CANCELLED,
        }
    ),
    ApplicationRunStatus.RUNNING: frozenset(
        {
            ApplicationRunStatus.NEEDS_INPUT,
            ApplicationRunStatus.PAUSED_AUTH,
            ApplicationRunStatus.FAILED_RETRYABLE,
            ApplicationRunStatus.FAILED_FINAL,
            ApplicationRunStatus.SUBMISSION_UNKNOWN,
            ApplicationRunStatus.SUBMITTED,
            ApplicationRunStatus.QUEUED,
            ApplicationRunStatus.CANCELLED,
        }
    ),
    ApplicationRunStatus.NEEDS_INPUT: frozenset(
        {
            ApplicationRunStatus.QUEUED,
            ApplicationRunStatus.CANCELLED,
        }
    ),
    ApplicationRunStatus.PAUSED_AUTH: frozenset(
        {
            ApplicationRunStatus.QUEUED,
            ApplicationRunStatus.CANCELLED,
        }
    ),
    ApplicationRunStatus.FAILED_RETRYABLE: frozenset(
        {
            ApplicationRunStatus.QUEUED,
            ApplicationRunStatus.CANCELLED,
        }
    ),
    ApplicationRunStatus.SUBMITTED: frozenset(),
    ApplicationRunStatus.SUBMISSION_UNKNOWN: frozenset(),
    ApplicationRunStatus.FAILED_FINAL: frozenset(),
    ApplicationRunStatus.CANCELLED: frozenset(),
}


class InvalidStateTransitionError(ValueError):
    """Raised when an illegal status transition is requested."""


def is_terminal_status(status: ApplicationRunStatus) -> bool:
    return status in TERMINAL_STATUSES


def is_active_status(status: ApplicationRunStatus) -> bool:
    return status in ACTIVE_STATUSES


def validate_run_transition(
    current: ApplicationRunStatus, target: ApplicationRunStatus
) -> None:
    if is_terminal_status(current):
        raise InvalidStateTransitionError(
            f"Cannot transition application run from terminal status "
            f"'{current.value}' to '{target.value}'"
        )
    allowed = VALID_TRANSITIONS.get(current, frozenset())
    if target not in allowed:
        raise InvalidStateTransitionError(
            f"Cannot transition application run from '{current.value}' "
            f"to '{target.value}'"
        )


def calculate_token_hash(token: str) -> str:
    cleaned = token.strip()
    if not cleaned:
        raise ValueError("Token must be non-empty")
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()


def calculate_answer_bank_hash(snapshot: dict[str, int]) -> str:
    canonical_json = json.dumps(snapshot, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical_json.encode("utf-8")).hexdigest()


def calculate_idempotency_key(
    canonical_url: str,
    resume_sha256: str,
    profile_version: int,
    answer_bank_hash: str,
) -> str:
    raw = f"{canonical_url}:{resume_sha256}:{profile_version}:{answer_bank_hash}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


_SENSITIVE_KEY_PATTERN = re.compile(
    r"(?i)(password|secret|token|authorization|cookie|bearer|ssn|cpf|credit_card|cvv|api_key|auth_token|access_token)"
)


def redact_audit_payload(payload: dict[str, Any]) -> dict[str, Any]:
    redacted: dict[str, Any] = {}
    for key, value in payload.items():
        if _SENSITIVE_KEY_PATTERN.search(key):
            redacted[key] = "[REDACTED]"
        elif isinstance(value, dict):
            redacted[key] = redact_audit_payload(value)
        elif isinstance(value, list):
            redacted[key] = [
                redact_audit_payload(item) if isinstance(item, dict) else item
                for item in value
            ]
        elif isinstance(value, str):
            if len(value) > 1000:
                redacted[key] = value[:200] + "... [TRUNCATED]"
            else:
                redacted[key] = value
        else:
            redacted[key] = value
    return redacted


_DOM_PASSWORD_INPUT_PATTERN = re.compile(
    r'(<input[^>]*type=["\']password["\'][^>]*value=["\'])([^"\']*)(["\'])',
    re.IGNORECASE,
)
_CREDIT_CARD_PATTERN = re.compile(r"\b(?:\d[ -]*?){13,16}\b")
_SSN_PATTERN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")
_BEARER_AUTH_PATTERN = re.compile(r"(?i)bearer\s+[a-zA-Z0-9_\-\.]+")


def sanitize_dom_snapshot(dom_text: str) -> str:
    sanitized = _DOM_PASSWORD_INPUT_PATTERN.sub(r"\1[REDACTED]\3", dom_text)
    sanitized = _CREDIT_CARD_PATTERN.sub("[REDACTED_CC]", sanitized)
    sanitized = _SSN_PATTERN.sub("[REDACTED_SSN]", sanitized)
    sanitized = _BEARER_AUTH_PATTERN.sub("Bearer [REDACTED]", sanitized)
    return sanitized


class ReceiptSummary(FrozenModel):
    platform_adapter_id: str
    final_url: str | None = None
    platform_receipt_id: str | None = None
    confirmation_signal: str
    capture_timestamp: datetime
    artifact_hash: str
    summary_notes: str | None = None

    @field_validator("capture_timestamp")
    @classmethod
    def validate_capture_timestamp(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)

    @field_validator("artifact_hash")
    @classmethod
    def validate_artifact_hash(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if len(cleaned) != 64 or not all(c in "0123456789abcdef" for c in cleaned):
            raise ValueError(
                "artifact_hash must be a 64-character lowercase hex string"
            )
        return cleaned

    @field_validator("platform_adapter_id", "confirmation_signal")
    @classmethod
    def validate_non_empty(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("Field must be non-empty")
        return stripped


class ApplicationRun(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    applicant_profile_id: UUID = Field(default_factory=uuid4)
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
    automatic_submission_authorized_at: datetime | None = None
    status: ApplicationRunStatus = ApplicationRunStatus.QUEUED
    current_step: str | None = None
    current_checkpoint: str | None = None
    submit_attempted_at: datetime | None = None
    attempt_count: int = 0
    retry_failure_count: int = 0
    max_retries: int = 2
    idempotency_key: str
    lease_token_hash: str | None = None
    lease_expires_at: datetime | None = None
    runner_id: str | None = None
    terminal_reason: str | None = None
    receipt_summary: ReceiptSummary | None = None
    policy_snapshot: dict[str, Any] | None = None
    duplicate_override_confirmed_at: datetime | None = None
    duplicate_override_reason: str | None = None
    created_at: datetime
    updated_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    events: tuple[ApplicationRunEvent, ...] = ()
    exceptions: tuple[ApplicationException, ...] = ()
    evidence: tuple[EvidenceArtifact, ...] = ()
    resume_grants: tuple[ResumeAssetGrant, ...] = ()

    @field_validator(
        "created_at",
        "updated_at",
        "started_at",
        "completed_at",
        "submit_attempted_at",
        "automatic_submission_authorized_at",
        "lease_expires_at",
        "duplicate_override_confirmed_at",
    )
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)

    @field_validator("canonical_application_url", "application_url")
    @classmethod
    def validate_urls(cls, value: str) -> str:
        return _require_http_url(value)

    @model_validator(mode="after")
    def validate_terminal_invariants(self) -> Self:
        if (
            self.automation_mode != AutomationMode.FULL_AUTO
            and self.automatic_submission_authorized_at is not None
        ):
            raise ValueError(
                "Automatic-submission authorization is valid only for FULL_AUTO runs"
            )
        if self.status == ApplicationRunStatus.SUBMITTED:
            if self.receipt_summary is None:
                raise ValueError("SUBMITTED status requires receipt_summary")
            if self.completed_at is None:
                raise ValueError("SUBMITTED status requires completed_at timestamp")
        if is_terminal_status(self.status) and self.completed_at is None:
            raise ValueError(
                f"Terminal status {self.status.value} requires completed_at timestamp"
            )
        return self

    @property
    def automatic_submission_authorized(self) -> bool:
        return (
            self.automation_mode == AutomationMode.FULL_AUTO
            and self.automatic_submission_authorized_at is not None
        )


class ApplicationRunEvent(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    attempt: int
    sequence_num: int
    event_type: str
    event_payload: dict[str, Any] = Field(default_factory=dict)
    idempotency_key: str | None = None
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)


class ApplicationException(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    exception_type: ExceptionType
    status: ExceptionStatus = ExceptionStatus.PENDING
    context_payload: dict[str, Any] = Field(default_factory=dict)
    resolution_payload: dict[str, Any] | None = None
    created_at: datetime
    resolved_at: datetime | None = None

    @field_validator("created_at", "resolved_at")
    @classmethod
    def validate_timestamps(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class EvidenceArtifact(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    attempt: int
    evidence_type: EvidenceType
    relative_path: str
    sha256: str
    file_size_bytes: int | None = None
    captured_at: datetime
    metadata_payload: dict[str, Any] | None = None

    @field_validator("captured_at")
    @classmethod
    def validate_captured_at(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)

    @field_validator("sha256")
    @classmethod
    def validate_sha256(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if len(cleaned) != 64 or not all(c in "0123456789abcdef" for c in cleaned):
            raise ValueError("sha256 must be a 64-character lowercase hex string")
        return cleaned


class ResumeAssetGrant(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    run_id: UUID
    resume_asset_id: UUID
    grant_token_hash: str
    sha256: str
    expires_at: datetime
    consumed_at: datetime | None = None
    created_at: datetime

    @field_validator("created_at", "expires_at", "consumed_at")
    @classmethod
    def validate_timestamps(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)
