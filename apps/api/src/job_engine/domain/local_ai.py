"""Local-AI runtime domain types, failure codes, and versioned schemas."""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Literal, Self
from uuid import UUID, uuid4

from pydantic import Field, field_validator, model_validator

from job_engine.domain.applicant import FrozenModel

# Schema / prompt revisions for structured local-AI tasks.
SELF_TEST_SCHEMA_REVISION = "1"
RESUME_PROPOSAL_SCHEMA_REVISION = "1"
GROUNDED_ANSWER_SCHEMA_REVISION = "1"
LOCAL_AI_PROMPT_REVISION = "1"

DEFAULT_LOCAL_MODEL = "qwen3:4b"

# Profile field paths the model may propose. Everything else is discarded.
ALLOWED_PROPOSAL_FIELD_PATHS: frozenset[str] = frozenset(
    {
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
        "employment_history",
        "education_history",
        "skills",
        "languages",
        "certifications",
    }
)

# Absolute prohibition — never inferred from resume or model output.
PROHIBITED_PROPOSAL_FIELD_PATHS: frozenset[str] = frozenset(
    {
        "work_authorizations",
        "compensation_expectation",
        "location_preferences",
        "demographics",
        "notice_period_days",
    }
)


class LocalAiFailureCode(StrEnum):
    NOT_CONFIGURED = "not_configured"
    RUNTIME_UNREACHABLE = "runtime_unreachable"
    MODEL_MISSING = "model_missing"
    QUEUE_FULL = "queue_full"
    TIMEOUT = "timeout"
    INVALID_STRUCTURE = "invalid_structure"
    UNGROUNDED = "ungrounded"
    INTERNAL_ERROR = "internal_error"


class LocalAiTaskClass(StrEnum):
    SELF_TEST = "self_test"
    RESUME_EXTRACTION = "resume_extraction"
    APPLICATION_ANSWER = "application_answer"


class LocalAiProposalStatus(StrEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    DECLINED = "declined"
    PARTIALLY_ACCEPTED = "partially_accepted"
    FAILED = "failed"


class LocalAiError(Exception):
    """Typed local-AI failure with a stable failure code."""

    def __init__(self, code: LocalAiFailureCode, message: str) -> None:
        super().__init__(message)
        self.code = code
        self.message = message


def _require_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError("datetime must be timezone-aware UTC")
    return value.astimezone(UTC)


class SourceSpan(FrozenModel):
    """Deterministic text reference into extracted resume source."""

    start: int = Field(ge=0)
    end: int = Field(ge=0)
    excerpt: str = ""

    @model_validator(mode="after")
    def validate_span(self) -> Self:
        if self.end < self.start:
            raise ValueError("source span end must be >= start")
        return self


class ProposedField(FrozenModel):
    field_path: str
    value: Any
    evidence: tuple[SourceSpan, ...] = ()
    confidence: float | None = None

    @field_validator("field_path")
    @classmethod
    def validate_field_path(cls, value: str) -> str:
        stripped = value.strip()
        if not stripped:
            raise ValueError("field_path must be non-empty")
        if stripped in PROHIBITED_PROPOSAL_FIELD_PATHS:
            raise ValueError(f"prohibited field_path: {stripped}")
        if stripped not in ALLOWED_PROPOSAL_FIELD_PATHS:
            raise ValueError(f"unsupported field_path: {stripped}")
        return stripped

    @field_validator("confidence")
    @classmethod
    def validate_confidence(cls, value: float | None) -> float | None:
        if value is None:
            return None
        if not (0.0 <= value <= 1.0):
            raise ValueError("confidence must be in [0.0, 1.0]")
        return value


class ResumeProfileProposal(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    profile_id: UUID
    source_asset_id: UUID
    source_asset_sha256: str
    status: LocalAiProposalStatus = LocalAiProposalStatus.PENDING
    schema_revision: str = RESUME_PROPOSAL_SCHEMA_REVISION
    prompt_revision: str = LOCAL_AI_PROMPT_REVISION
    model: str
    fields: tuple[ProposedField, ...] = ()
    failure_code: LocalAiFailureCode | None = None
    deterministic_extraction_ok: bool = True
    accepted_field_paths: tuple[str, ...] = ()
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)

    @field_validator("source_asset_sha256")
    @classmethod
    def validate_sha256(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if len(cleaned) != 64 or not all(c in "0123456789abcdef" for c in cleaned):
            raise ValueError("sha256 must be a 64-character lowercase hex string")
        return cleaned


class LocalAiSelfTestRecord(FrozenModel):
    """Sanitized singleton self-test diagnostics — never stores prompts/raw payloads."""

    id: int = 1
    passed: bool | None = None
    model: str | None = None
    schema_revision: str | None = None
    prompt_revision: str | None = None
    latency_ms: int | None = None
    failure_code: LocalAiFailureCode | None = None
    tested_at: datetime | None = None
    updated_at: datetime

    @field_validator("tested_at", "updated_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class LocalAiStatus(FrozenModel):
    configured: bool
    endpoint_class: Literal["loopback_openai_compatible", "none"]
    model: str | None
    reachable: bool | None = None
    model_available: bool | None = None
    schema_revision: str = RESUME_PROPOSAL_SCHEMA_REVISION
    last_self_test_passed: bool | None = None
    last_self_test_at: datetime | None = None
    last_self_test_latency_ms: int | None = None
    failure_code: LocalAiFailureCode | None = None

    @field_validator("last_self_test_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class LocalAiReadinessProjection(FrozenModel):
    """Combined readiness used by FRONT-007 — no private content."""

    local_ai_configured: bool
    local_ai_ready: bool
    local_ai_failure_code: LocalAiFailureCode | None = None
    model: str | None = None
    last_self_test_passed: bool | None = None
    exceptions: tuple[str, ...] = ()


# Versioned JSON schemas accepted from the model (strict JSON only).

SELF_TEST_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "ok": {"type": "boolean"},
        "echo": {"type": "string"},
    },
    "required": ["ok", "echo"],
    "additionalProperties": False,
}

RESUME_PROPOSAL_RESPONSE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "fields": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "field_path": {"type": "string"},
                    "value": {},
                    "evidence": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "start": {"type": "integer", "minimum": 0},
                                "end": {"type": "integer", "minimum": 0},
                                "excerpt": {"type": "string"},
                            },
                            "required": ["start", "end"],
                            "additionalProperties": False,
                        },
                    },
                    "confidence": {
                        "type": "number",
                        "minimum": 0.0,
                        "maximum": 1.0,
                    },
                },
                "required": ["field_path", "value"],
                "additionalProperties": False,
            },
        }
    },
    "required": ["fields"],
    "additionalProperties": False,
}
