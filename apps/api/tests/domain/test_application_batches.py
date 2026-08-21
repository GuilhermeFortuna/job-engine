"""Domain tests for durable application batches (BACK-017)."""

import pytest

from job_engine.domain.application_batches import (
    BATCH_CANCELABLE_RUN_STATUSES,
    BATCH_CONFIRMATION_REVISION,
    ApplicationBatchCounters,
    derive_batch_counters,
    is_batch_item_cancellable,
    validate_batch_confirmation,
    validate_confirmation_revision,
)
from job_engine.domain.applications import ApplicationRunStatus, AutomationMode


def test_derive_batch_counters_mixed_states() -> None:
    counters = derive_batch_counters(
        (
            ApplicationRunStatus.QUEUED,
            ApplicationRunStatus.CLAIMED,
            ApplicationRunStatus.RUNNING,
            ApplicationRunStatus.NEEDS_INPUT,
            ApplicationRunStatus.PAUSED_AUTH,
            ApplicationRunStatus.SUBMITTED,
            ApplicationRunStatus.FAILED_FINAL,
            ApplicationRunStatus.SUBMISSION_UNKNOWN,
            ApplicationRunStatus.FAILED_RETRYABLE,
            ApplicationRunStatus.CANCELLED,
        )
    )
    assert counters == ApplicationBatchCounters(
        queued=1,
        running=2,
        needs_attention=2,
        submitted=1,
        failed=3,
        cancelled=1,
    )
    assert counters.total == 10


def test_batch_cancelable_statuses_never_include_terminal_outcomes() -> None:
    assert ApplicationRunStatus.SUBMITTED not in BATCH_CANCELABLE_RUN_STATUSES
    assert ApplicationRunStatus.SUBMISSION_UNKNOWN not in BATCH_CANCELABLE_RUN_STATUSES
    assert ApplicationRunStatus.FAILED_FINAL not in BATCH_CANCELABLE_RUN_STATUSES
    assert ApplicationRunStatus.CANCELLED not in BATCH_CANCELABLE_RUN_STATUSES
    assert is_batch_item_cancellable(ApplicationRunStatus.QUEUED)
    assert is_batch_item_cancellable(ApplicationRunStatus.RUNNING)
    assert not is_batch_item_cancellable(ApplicationRunStatus.SUBMITTED)


def test_confirmation_revision_and_full_auto_text() -> None:
    validate_confirmation_revision(BATCH_CONFIRMATION_REVISION)
    with pytest.raises(ValueError, match="confirmation_revision"):
        validate_confirmation_revision("stale")

    validate_batch_confirmation(
        automation_mode=AutomationMode.FULL_AUTO,
        confirmation_revision=BATCH_CONFIRMATION_REVISION,
        owner_confirmation="Authorize automatic submission for these selected jobs",
    )
    with pytest.raises(ValueError, match="owner_confirmation"):
        validate_batch_confirmation(
            automation_mode=AutomationMode.FULL_AUTO,
            confirmation_revision=BATCH_CONFIRMATION_REVISION,
            owner_confirmation="wrong",
        )
    validate_batch_confirmation(
        automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
        confirmation_revision=BATCH_CONFIRMATION_REVISION,
        owner_confirmation=None,
    )
