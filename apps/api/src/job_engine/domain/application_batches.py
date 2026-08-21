"""Durable application-batch domain (BACK-017).

Batch authorization freezes identity and policy inputs. Per-run status
transitions remain owned by ``domain.applications``; batch status and counters
are always derived from item/run states and are never a second mutable authority.
"""

from __future__ import annotations

from datetime import UTC, datetime
from enum import StrEnum
from typing import Any, Self
from uuid import UUID, uuid4

from pydantic import Field, field_validator, model_validator

from job_engine.domain.applications import (
    FULL_AUTO_OWNER_CONFIRMATION,
    ApplicationRunStatus,
    AutomationMode,
    FrozenModel,
    is_terminal_status,
)

BATCH_CONFIRMATION_TEXT = FULL_AUTO_OWNER_CONFIRMATION
BATCH_CONFIRMATION_REVISION = "back-017.1"
BATCH_POLICY_REVISION = "back-017.1"

DEFAULT_MAX_BATCH_SIZE = 25


class ApplicationBatchOrigin(StrEnum):
    AUTHORIZED = "authorized"
    LEGACY_IMPORT = "legacy_import"


class BatchPreviewIssueSeverity(StrEnum):
    ERROR = "error"
    WARNING = "warning"


class BatchPreviewIssueCode(StrEnum):
    PROFILE_NOT_FOUND = "PROFILE_NOT_FOUND"
    PROFILE_VERSION_MISMATCH = "PROFILE_VERSION_MISMATCH"
    RESUME_NOT_FOUND = "RESUME_NOT_FOUND"
    RESUME_VERSION_MISMATCH = "RESUME_VERSION_MISMATCH"
    RESUME_HASH_MISMATCH = "RESUME_HASH_MISMATCH"
    RESUME_FILE_MISSING = "RESUME_FILE_MISSING"
    TARGET_NOT_FOUND = "TARGET_NOT_FOUND"
    TARGET_NOT_EXECUTABLE = "TARGET_NOT_EXECUTABLE"
    TARGET_POSTING_MISSING = "TARGET_POSTING_MISSING"
    TARGET_POSTING_INACTIVE = "TARGET_POSTING_INACTIVE"
    TARGET_GROUP_MISSING = "TARGET_GROUP_MISSING"
    TARGET_GROUP_INACTIVE = "TARGET_GROUP_INACTIVE"
    TARGET_UNSUPPORTED_PROVIDER = "TARGET_UNSUPPORTED_PROVIDER"
    TARGET_CONTRACT_MISMATCH = "TARGET_CONTRACT_MISMATCH"
    TARGET_ADAPTER_MISMATCH = "TARGET_ADAPTER_MISMATCH"
    TARGET_ADAPTER_UNSUPPORTED = "TARGET_ADAPTER_UNSUPPORTED"
    LOOKALIKE_HOST = "LOOKALIKE_HOST"
    HOST_PATH_MISMATCH = "HOST_PATH_MISMATCH"
    PROVIDER_REGION_UNBOUND = "PROVIDER_REGION_UNBOUND"
    URL_CREDENTIALS = "URL_CREDENTIALS"
    MISSING_HOST = "MISSING_HOST"
    DUPLICATE_TARGET_IN_BATCH = "DUPLICATE_TARGET_IN_BATCH"
    DUPLICATE_ACTIVE_RUN = "DUPLICATE_ACTIVE_RUN"
    QUEUE_LIMIT_EXCEEDED = "QUEUE_LIMIT_EXCEEDED"
    BATCH_EMPTY = "BATCH_EMPTY"
    BATCH_TOO_LARGE = "BATCH_TOO_LARGE"
    CONFIRMATION_REVISION_MISMATCH = "CONFIRMATION_REVISION_MISMATCH"
    CONFIRMATION_TEXT_MISMATCH = "CONFIRMATION_TEXT_MISMATCH"
    CROSS_PROFILE_RESUME = "CROSS_PROFILE_RESUME"


# Statuses a batch cancel may transition to CANCELLED. Terminal submitted /
# submission_unknown / failed_final outcomes are never rewritten.
BATCH_CANCELABLE_RUN_STATUSES: frozenset[ApplicationRunStatus] = frozenset(
    {
        ApplicationRunStatus.QUEUED,
        ApplicationRunStatus.CLAIMED,
        ApplicationRunStatus.RUNNING,
        ApplicationRunStatus.NEEDS_INPUT,
        ApplicationRunStatus.PAUSED_AUTH,
        ApplicationRunStatus.FAILED_RETRYABLE,
    }
)


class ApplicationBatchCounters(FrozenModel):
    queued: int = 0
    running: int = 0
    needs_attention: int = 0
    submitted: int = 0
    failed: int = 0
    cancelled: int = 0

    @model_validator(mode="after")
    def validate_non_negative(self) -> Self:
        for name in (
            "queued",
            "running",
            "needs_attention",
            "submitted",
            "failed",
            "cancelled",
        ):
            if getattr(self, name) < 0:
                raise ValueError(f"{name} count must be non-negative")
        return self

    @property
    def total(self) -> int:
        return (
            self.queued
            + self.running
            + self.needs_attention
            + self.submitted
            + self.failed
            + self.cancelled
        )


def derive_batch_counters(
    run_statuses: tuple[ApplicationRunStatus, ...] | list[ApplicationRunStatus],
) -> ApplicationBatchCounters:
    queued = 0
    running = 0
    needs_attention = 0
    submitted = 0
    failed = 0
    cancelled = 0
    for status in run_statuses:
        if status == ApplicationRunStatus.QUEUED:
            queued += 1
        elif status in {
            ApplicationRunStatus.CLAIMED,
            ApplicationRunStatus.RUNNING,
        }:
            running += 1
        elif status in {
            ApplicationRunStatus.NEEDS_INPUT,
            ApplicationRunStatus.PAUSED_AUTH,
        }:
            needs_attention += 1
        elif status == ApplicationRunStatus.SUBMITTED:
            submitted += 1
        elif status in {
            ApplicationRunStatus.FAILED_RETRYABLE,
            ApplicationRunStatus.FAILED_FINAL,
            ApplicationRunStatus.SUBMISSION_UNKNOWN,
        }:
            failed += 1
        elif status == ApplicationRunStatus.CANCELLED:
            cancelled += 1
        else:
            failed += 1
    return ApplicationBatchCounters(
        queued=queued,
        running=running,
        needs_attention=needs_attention,
        submitted=submitted,
        failed=failed,
        cancelled=cancelled,
    )


def is_batch_item_cancellable(status: ApplicationRunStatus) -> bool:
    return status in BATCH_CANCELABLE_RUN_STATUSES


def validate_confirmation_revision(revision: str) -> None:
    cleaned = revision.strip()
    if cleaned != BATCH_CONFIRMATION_REVISION:
        raise ValueError(
            f"confirmation_revision must be '{BATCH_CONFIRMATION_REVISION}'"
        )


def validate_batch_confirmation(
    *,
    automation_mode: AutomationMode,
    confirmation_revision: str,
    owner_confirmation: str | None,
) -> None:
    validate_confirmation_revision(confirmation_revision)
    if automation_mode == AutomationMode.FULL_AUTO:
        if owner_confirmation != BATCH_CONFIRMATION_TEXT:
            raise ValueError(
                "owner_confirmation must exactly authorize automatic submission"
            )
    elif owner_confirmation is not None:
        raise ValueError("owner_confirmation is only accepted for full_auto")


class BatchPreviewIssue(FrozenModel):
    code: BatchPreviewIssueCode
    severity: BatchPreviewIssueSeverity
    message: str
    application_target_id: UUID | None = None
    existing_run_id: UUID | None = None


class ApplicationBatchItemSnapshot(FrozenModel):
    """Immutable per-item job/target snapshot captured at authorization."""

    job_group_id: UUID
    application_target_id: UUID | None = None
    source_posting_id: UUID | None = None
    canonical_application_url: str
    application_url: str
    platform_adapter_id: str
    duplicate_override_reason: str | None = None


class ApplicationBatchItem(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    batch_id: UUID
    position: int
    run_id: UUID
    snapshot: ApplicationBatchItemSnapshot
    run_status: ApplicationRunStatus
    created_at: datetime

    @field_validator("created_at")
    @classmethod
    def validate_created_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("datetime must be timezone-aware UTC")
        return value.astimezone(UTC)

    @field_validator("position")
    @classmethod
    def validate_position(cls, value: int) -> int:
        if value < 0:
            raise ValueError("position must be non-negative")
        return value


class ApplicationBatchAuthorization(FrozenModel):
    """Immutable authorization envelope owned by the batch row."""

    applicant_profile_id: UUID
    applicant_profile_version: int
    resume_asset_id: UUID
    resume_asset_version: int
    resume_sha256: str
    answer_bank_snapshot: dict[str, int]
    answer_bank_hash: str
    automation_mode: AutomationMode
    known_capability_exceptions: tuple[dict[str, Any], ...] = ()
    policy_revision: str = BATCH_POLICY_REVISION
    confirmation_text_revision: str = BATCH_CONFIRMATION_REVISION
    confirmation_text: str = BATCH_CONFIRMATION_TEXT
    owner_confirmed_at: datetime

    @field_validator("owner_confirmed_at")
    @classmethod
    def validate_confirmed_at(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("datetime must be timezone-aware UTC")
        return value.astimezone(UTC)

    @field_validator("resume_sha256", "answer_bank_hash")
    @classmethod
    def validate_hashes(cls, value: str) -> str:
        cleaned = value.strip().lower()
        if len(cleaned) != 64 or not all(c in "0123456789abcdef" for c in cleaned):
            raise ValueError("hash must be a 64-character lowercase hex string")
        return cleaned


class ApplicationBatch(FrozenModel):
    id: UUID = Field(default_factory=uuid4)
    origin: ApplicationBatchOrigin
    authorization: ApplicationBatchAuthorization
    items: tuple[ApplicationBatchItem, ...] = ()
    counters: ApplicationBatchCounters = Field(default_factory=ApplicationBatchCounters)
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def validate_timestamps(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
            raise ValueError("datetime must be timezone-aware UTC")
        return value.astimezone(UTC)

    @model_validator(mode="after")
    def validate_item_invariants(self) -> Self:
        if self.origin == ApplicationBatchOrigin.AUTHORIZED and len(self.items) < 1:
            # Empty is allowed only while constructing before items attach;
            # persisted authorized batches always have >= 1 item.
            pass
        positions = [item.position for item in self.items]
        if positions != sorted(positions):
            raise ValueError("batch items must be ordered by ascending position")
        if len(set(positions)) != len(positions):
            raise ValueError("batch item positions must be unique")
        run_ids = [item.run_id for item in self.items]
        if len(set(run_ids)) != len(run_ids):
            raise ValueError("each batch item must link a distinct run")
        return self

    @property
    def applicant_profile_id(self) -> UUID:
        return self.authorization.applicant_profile_id

    @property
    def all_items_terminal(self) -> bool:
        return bool(self.items) and all(
            is_terminal_status(item.run_status) for item in self.items
        )
