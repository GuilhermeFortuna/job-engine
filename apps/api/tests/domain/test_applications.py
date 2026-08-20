from datetime import UTC, datetime
from uuid import uuid4

import pytest

from job_engine.domain.applications import (
    ApplicationRun,
    ApplicationRunStatus,
    AutomationMode,
    InvalidStateTransitionError,
    ReceiptSummary,
    calculate_answer_bank_hash,
    calculate_idempotency_key,
    calculate_token_hash,
    is_active_status,
    is_terminal_status,
    redact_audit_payload,
    sanitize_dom_snapshot,
    validate_run_transition,
)


def test_status_sets_and_transition_matrix() -> None:
    # 1. Test terminal and active statuses
    assert is_terminal_status(ApplicationRunStatus.SUBMITTED)
    assert is_terminal_status(ApplicationRunStatus.SUBMISSION_UNKNOWN)
    assert is_terminal_status(ApplicationRunStatus.FAILED_FINAL)
    assert is_terminal_status(ApplicationRunStatus.CANCELLED)
    assert not is_terminal_status(ApplicationRunStatus.RUNNING)
    assert not is_terminal_status(ApplicationRunStatus.QUEUED)

    assert is_active_status(ApplicationRunStatus.QUEUED)
    assert is_active_status(ApplicationRunStatus.CLAIMED)
    assert is_active_status(ApplicationRunStatus.RUNNING)
    assert is_active_status(ApplicationRunStatus.NEEDS_INPUT)
    assert is_active_status(ApplicationRunStatus.PAUSED_AUTH)
    assert is_active_status(ApplicationRunStatus.FAILED_RETRYABLE)
    assert not is_active_status(ApplicationRunStatus.SUBMITTED)

    # 2. Valid transitions
    validate_run_transition(ApplicationRunStatus.QUEUED, ApplicationRunStatus.CLAIMED)
    validate_run_transition(ApplicationRunStatus.QUEUED, ApplicationRunStatus.CANCELLED)
    validate_run_transition(ApplicationRunStatus.CLAIMED, ApplicationRunStatus.RUNNING)
    validate_run_transition(ApplicationRunStatus.CLAIMED, ApplicationRunStatus.QUEUED)
    validate_run_transition(
        ApplicationRunStatus.RUNNING, ApplicationRunStatus.NEEDS_INPUT
    )
    validate_run_transition(
        ApplicationRunStatus.RUNNING, ApplicationRunStatus.PAUSED_AUTH
    )
    validate_run_transition(
        ApplicationRunStatus.RUNNING, ApplicationRunStatus.FAILED_RETRYABLE
    )
    validate_run_transition(
        ApplicationRunStatus.RUNNING, ApplicationRunStatus.SUBMITTED
    )
    validate_run_transition(
        ApplicationRunStatus.RUNNING, ApplicationRunStatus.SUBMISSION_UNKNOWN
    )
    validate_run_transition(
        ApplicationRunStatus.RUNNING, ApplicationRunStatus.FAILED_FINAL
    )
    validate_run_transition(
        ApplicationRunStatus.NEEDS_INPUT, ApplicationRunStatus.QUEUED
    )
    validate_run_transition(
        ApplicationRunStatus.PAUSED_AUTH, ApplicationRunStatus.QUEUED
    )
    validate_run_transition(
        ApplicationRunStatus.FAILED_RETRYABLE, ApplicationRunStatus.QUEUED
    )

    # 3. Invalid transitions from terminal states
    for terminal in [
        ApplicationRunStatus.SUBMITTED,
        ApplicationRunStatus.SUBMISSION_UNKNOWN,
        ApplicationRunStatus.FAILED_FINAL,
        ApplicationRunStatus.CANCELLED,
    ]:
        for target in ApplicationRunStatus:
            if target != terminal:
                with pytest.raises(InvalidStateTransitionError):
                    validate_run_transition(terminal, target)

    # 4. Invalid arbitrary transitions
    with pytest.raises(InvalidStateTransitionError):
        validate_run_transition(
            ApplicationRunStatus.QUEUED, ApplicationRunStatus.SUBMITTED
        )
    with pytest.raises(InvalidStateTransitionError):
        validate_run_transition(
            ApplicationRunStatus.NEEDS_INPUT, ApplicationRunStatus.RUNNING
        )


def test_answer_bank_hash_and_idempotency_key() -> None:
    snapshot1 = {"ans_work_auth": 1, "ans_relocation": 2}
    snapshot2 = {"ans_relocation": 2, "ans_work_auth": 1}

    hash1 = calculate_answer_bank_hash(snapshot1)
    hash2 = calculate_answer_bank_hash(snapshot2)
    assert hash1 == hash2
    assert len(hash1) == 64

    idem1 = calculate_idempotency_key(
        "https://example.com/apply/123", "a" * 64, 1, hash1
    )
    idem2 = calculate_idempotency_key(
        "https://example.com/apply/123", "a" * 64, 1, hash2
    )
    assert idem1 == idem2
    assert len(idem1) == 64

    # Different profile version produces different idempotency key
    idem3 = calculate_idempotency_key(
        "https://example.com/apply/123", "a" * 64, 2, hash1
    )
    assert idem1 != idem3


def test_token_hash() -> None:
    token = "secret-runner-token-12345"
    thash = calculate_token_hash(token)
    assert len(thash) == 64
    assert calculate_token_hash(token) == thash

    with pytest.raises(ValueError):
        calculate_token_hash("   ")


def test_redact_audit_payload() -> None:
    payload = {
        "user_email": "user@example.com",
        "password": "super-secret-password",
        "auth_token": "bearer-12345",
        "cookie_header": "session=abc123xyz",
        "nested": {
            "api_key": "sk-123456789",
            "safe_field": "visible value",
        },
        "list_data": [
            {"secret_answer": "my mother maiden name", "question": "security?"},
            "plain_item",
        ],
        "long_text": "A" * 1500,
    }

    redacted = redact_audit_payload(payload)
    assert redacted["user_email"] == "user@example.com"
    assert redacted["password"] == "[REDACTED]"
    assert redacted["auth_token"] == "[REDACTED]"
    assert redacted["cookie_header"] == "[REDACTED]"
    assert redacted["nested"]["api_key"] == "[REDACTED]"
    assert redacted["nested"]["safe_field"] == "visible value"
    assert redacted["list_data"][0]["secret_answer"] == "[REDACTED]"
    assert redacted["list_data"][0]["question"] == "security?"
    assert redacted["list_data"][1] == "plain_item"
    assert "... [TRUNCATED]" in redacted["long_text"]


def test_sanitize_dom_snapshot() -> None:
    dom = """
    <html>
      <form>
        <input type="text" name="name" value="Dakota Rivera" />
        <input type="password" name="pwd" value="SecretPass123!" />
        <div class="card">Card number: 4532-1234-5678-9012</div>
        <div class="ssn">SSN: 123-45-6789</div>
        <p>Header: Bearer abc.def.ghi</p>
      </form>
    </html>
    """

    sanitized = sanitize_dom_snapshot(dom)
    assert "SecretPass123!" not in sanitized
    assert "[REDACTED]" in sanitized
    assert "4532-1234-5678-9012" not in sanitized
    assert "[REDACTED_CC]" in sanitized
    assert "123-45-6789" not in sanitized
    assert "[REDACTED_SSN]" in sanitized
    assert "abc.def.ghi" not in sanitized
    assert "Bearer [REDACTED]" in sanitized


def test_application_run_model_invariants() -> None:
    now = datetime.now(UTC)
    job_id = uuid4()
    resume_id = uuid4()

    # Valid run
    run = ApplicationRun(
        job_group_id=job_id,
        canonical_application_url="https://boards.greenhouse.io/acme/jobs/1",
        application_url="https://boards.greenhouse.io/acme/jobs/1?gh_jid=1",
        platform_adapter_id="greenhouse",
        resume_asset_id=resume_id,
        resume_sha256="a" * 64,
        applicant_profile_version=1,
        answer_bank_snapshot={"ans_1": 1},
        answer_bank_hash="b" * 64,
        automation_mode=AutomationMode.FULL_AUTO,
        status=ApplicationRunStatus.QUEUED,
        idempotency_key="c" * 64,
        created_at=now,
        updated_at=now,
    )
    assert run.status == ApplicationRunStatus.QUEUED
    assert run.automatic_submission_authorized is False

    authorized_run = run.model_copy(update={"automatic_submission_authorized_at": now})
    assert authorized_run.automatic_submission_authorized is True

    with pytest.raises(ValueError, match="authorization is valid only for FULL_AUTO"):
        ApplicationRun(
            **run.model_dump(
                exclude={"automation_mode", "automatic_submission_authorized_at"}
            ),
            automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
            automatic_submission_authorized_at=now,
        )

    # SUBMITTED status requires receipt_summary and completed_at
    with pytest.raises(ValueError, match="SUBMITTED status requires receipt_summary"):
        ApplicationRun(
            job_group_id=job_id,
            canonical_application_url="https://boards.greenhouse.io/acme/jobs/1",
            application_url="https://boards.greenhouse.io/acme/jobs/1",
            platform_adapter_id="greenhouse",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.FULL_AUTO,
            status=ApplicationRunStatus.SUBMITTED,
            idempotency_key="c" * 64,
            created_at=now,
            updated_at=now,
            completed_at=now,
        )

    receipt = ReceiptSummary(
        platform_adapter_id="greenhouse",
        final_url="https://boards.greenhouse.io/acme/jobs/1/confirmation",
        platform_receipt_id="gh_conf_987",
        confirmation_signal="Application submitted thank you",
        capture_timestamp=now,
        artifact_hash="d" * 64,
    )

    valid_submitted = ApplicationRun(
        job_group_id=job_id,
        canonical_application_url="https://boards.greenhouse.io/acme/jobs/1",
        application_url="https://boards.greenhouse.io/acme/jobs/1",
        platform_adapter_id="greenhouse",
        resume_asset_id=resume_id,
        resume_sha256="a" * 64,
        applicant_profile_version=1,
        answer_bank_snapshot={},
        answer_bank_hash="b" * 64,
        automation_mode=AutomationMode.FULL_AUTO,
        status=ApplicationRunStatus.SUBMITTED,
        receipt_summary=receipt,
        idempotency_key="c" * 64,
        created_at=now,
        updated_at=now,
        completed_at=now,
    )
    assert valid_submitted.status == ApplicationRunStatus.SUBMITTED
