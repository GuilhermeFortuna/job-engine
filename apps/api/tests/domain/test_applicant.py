from datetime import UTC, datetime, timedelta
from uuid import uuid4

import pytest
from pydantic import ValidationError

from job_engine.domain.applicant import (
    ApplicantProfile,
    ConfirmedField,
    EmploymentEntry,
    FieldSource,
    PolicyCategory,
    QuestionIntent,
    ResumeAsset,
    ReusableAnswer,
    ReusableAnswerInput,
    ValueState,
)


def _now_utc() -> datetime:
    return datetime.now(UTC)


def test_confirmed_field_provided_invariants() -> None:
    now = _now_utc()
    field = ConfirmedField[str](
        state=ValueState.PROVIDED,
        value="Jane Doe",
        source=FieldSource.OWNER,
        last_confirmed_at=now,
        policy_category=PolicyCategory.VERIFIED_PROFILE,
    )
    assert field.state == ValueState.PROVIDED
    assert field.value == "Jane Doe"
    assert field.source == FieldSource.OWNER
    assert field.last_confirmed_at == now

    # Provided requires value
    with pytest.raises(
        ValidationError, match="PROVIDED state requires a non-None value"
    ):
        ConfirmedField[str](
            state=ValueState.PROVIDED,
            value=None,
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        )

    # Provided requires source
    with pytest.raises(ValidationError, match="PROVIDED state requires a source"):
        ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Jane",
            source=None,
            last_confirmed_at=now,
        )

    # Provided requires last_confirmed_at
    with pytest.raises(
        ValidationError, match="PROVIDED state requires last_confirmed_at"
    ):
        ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Jane",
            source=FieldSource.OWNER,
            last_confirmed_at=None,
        )


def test_confirmed_field_unknown_invariants() -> None:
    field = ConfirmedField[str]()
    assert field.state == ValueState.UNKNOWN
    assert field.value is None
    assert field.source is None
    assert field.last_confirmed_at is None

    with pytest.raises(
        ValidationError, match="UNKNOWN state requires value to be None"
    ):
        ConfirmedField[str](state=ValueState.UNKNOWN, value="Jane")

    with pytest.raises(
        ValidationError, match="UNKNOWN state requires source to be None"
    ):
        ConfirmedField[str](state=ValueState.UNKNOWN, source=FieldSource.OWNER)

    with pytest.raises(
        ValidationError, match="UNKNOWN state requires last_confirmed_at to be None"
    ):
        ConfirmedField[str](state=ValueState.UNKNOWN, last_confirmed_at=_now_utc())


def test_confirmed_field_declined_invariants() -> None:
    now = _now_utc()
    field = ConfirmedField[str](
        state=ValueState.DECLINED,
        value=None,
        source=FieldSource.OWNER,
        last_confirmed_at=now,
        policy_category=PolicyCategory.DECLINE_OPTIONAL,
    )
    assert field.state == ValueState.DECLINED

    # Declined cannot have a value
    with pytest.raises(
        ValidationError, match="DECLINED state requires value to be None"
    ):
        ConfirmedField[str](
            state=ValueState.DECLINED,
            value="Jane",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        )

    # Declined requires OWNER source (cannot decline via resume import)
    with pytest.raises(
        ValidationError, match="DECLINED state requires source to be OWNER"
    ):
        ConfirmedField[str](
            state=ValueState.DECLINED,
            value=None,
            source=FieldSource.RESUME_IMPORT,
            last_confirmed_at=now,
        )

    # Declined requires timestamp
    with pytest.raises(
        ValidationError, match="DECLINED state requires last_confirmed_at"
    ):
        ConfirmedField[str](
            state=ValueState.DECLINED,
            value=None,
            source=FieldSource.OWNER,
            last_confirmed_at=None,
        )


def test_confirmed_field_timezone_awareness() -> None:
    naive_dt = datetime(2026, 1, 1, 12, 0, 0)
    with pytest.raises(ValidationError, match="timezone-aware UTC"):
        ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Jane",
            source=FieldSource.OWNER,
            last_confirmed_at=naive_dt,
        )


def test_reusable_answer_policy_intent_matrix() -> None:
    now = _now_utc()

    # Valid reusable answer
    ans = ReusableAnswer(
        answer_id="ans_work_auth_us",
        question_intent=QuestionIntent.WORK_AUTHORIZATION,
        jurisdiction="US",
        answer_text="Authorized to work in US via C2C/B2B",
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=now,
        version=1,
        created_at=now,
        updated_at=now,
    )
    assert ans.answer_id == "ans_work_auth_us"
    assert not ans.is_expired()

    # Legal intent with invalid policy (cannot be approved_reusable)
    with pytest.raises(
        ValidationError,
        match="is legal/consent and may only use",
    ):
        ReusableAnswerInput(
            answer_id="ans_sig",
            question_intent=QuestionIntent.SIGNATURE,
            answer_text="Jane Doe",
            policy_category=PolicyCategory.APPROVED_REUSABLE,
            provenance="owner_authored",
            last_confirmed_at=now,
        )

    # Legal intent with review_required is valid
    ans_legal = ReusableAnswerInput(
        answer_id="ans_bg_check",
        question_intent=QuestionIntent.BACKGROUND_CHECK_CONSENT,
        answer_text="Pending review",
        policy_category=PolicyCategory.REVIEW_REQUIRED,
        provenance="owner_authored",
        last_confirmed_at=now,
    )
    assert ans_legal.policy_category == PolicyCategory.REVIEW_REQUIRED

    # Decline optional on non-demographic intent is rejected
    with pytest.raises(
        ValidationError,
        match="decline_optional policy is only valid for demographic intents",
    ):
        ReusableAnswerInput(
            answer_id="ans_salary",
            question_intent=QuestionIntent.COMPENSATION_EXPECTATION,
            answer_text="Decline",
            policy_category=PolicyCategory.DECLINE_OPTIONAL,
            provenance="owner_authored",
            last_confirmed_at=now,
        )


def test_reusable_answer_expiry() -> None:
    now = _now_utc()
    past = now - timedelta(days=1)
    future = now + timedelta(days=30)

    ans_expired = ReusableAnswer(
        answer_id="ans_exp",
        question_intent=QuestionIntent.NOTICE_PERIOD,
        answer_text="2 weeks",
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=past,
        expires_at=past,
        version=1,
        created_at=past,
        updated_at=past,
    )
    assert ans_expired.is_expired(now)

    ans_active = ReusableAnswer(
        answer_id="ans_act",
        question_intent=QuestionIntent.NOTICE_PERIOD,
        answer_text="2 weeks",
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=now,
        expires_at=future,
        version=1,
        created_at=now,
        updated_at=now,
    )
    assert not ans_active.is_expired(now)


def test_resume_asset_sha256_validation() -> None:
    now = _now_utc()
    valid_sha = "a" * 64
    asset = ResumeAsset(
        resume_id="res_01",
        label="Primary Resume",
        source_markdown_path="docs/resume/my_resume.md",
        upload_pdf_path="docs/resume/my_resume.pdf",
        sha256=valid_sha,
        language="en",
        is_default=True,
        version=1,
        created_at=now,
        updated_at=now,
    )
    assert asset.sha256 == valid_sha

    # Invalid sha256 length or non-hex
    with pytest.raises(
        ValidationError, match="sha256 must be a 64-character lowercase hex string"
    ):
        ResumeAsset(
            resume_id="res_02",
            label="Invalid",
            source_markdown_path="docs/resume/my_resume.md",
            upload_pdf_path="docs/resume/my_resume.pdf",
            sha256="invalid-sha",
            version=1,
            created_at=now,
            updated_at=now,
        )


def test_applicant_profile_model_creation() -> None:
    now = _now_utc()
    profile = ApplicantProfile(
        id=uuid4(),
        version=1,
        created_at=now,
        updated_at=now,
        first_name=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Jane",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
            policy_category=PolicyCategory.VERIFIED_PROFILE,
        ),
        last_name=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Doe",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
            policy_category=PolicyCategory.VERIFIED_PROFILE,
        ),
        email=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="jane.doe@example.com",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
            policy_category=PolicyCategory.VERIFIED_PROFILE,
        ),
        phone=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="+1-555-0100",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
            policy_category=PolicyCategory.VERIFIED_PROFILE,
        ),
        employment_history=ConfirmedField[tuple[EmploymentEntry, ...]](
            state=ValueState.PROVIDED,
            value=(
                EmploymentEntry(
                    id=uuid4(),
                    company="Tech Corp",
                    title="Staff Engineer",
                    start_date="2022-01",
                    end_date=None,
                    is_current=True,
                    responsibilities=("Led distributed backend systems",),
                    technologies=("Python", "PostgreSQL", "FastAPI"),
                ),
            ),
            source=FieldSource.OWNER,
            last_confirmed_at=now,
            policy_category=PolicyCategory.VERIFIED_PROFILE,
        ),
    )
    assert profile.version == 1
    assert profile.first_name.value == "Jane"
    assert len(profile.employment_history.value or ()) == 1
