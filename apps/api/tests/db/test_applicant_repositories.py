from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

import pytest
from alembic import command
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db import models as orm
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    DefaultResumeConflictError,
    OptimisticLockError,
)
from job_engine.domain.applicant import (
    ApplicantProfileInput,
    CompensationExpectation,
    ConfirmedField,
    EmploymentEntry,
    FieldSource,
    PolicyCategory,
    QuestionIntent,
    ResumeAssetInput,
    ReusableAnswerInput,
    ValueState,
    WorkAuthorization,
)
from tests.db.conftest import alembic_config


def _now_utc() -> datetime:
    return datetime.now(UTC)


async def test_applicant_profile_repository_persistence_and_cas(
    db_session: AsyncSession,
) -> None:
    repo = ApplicantVaultRepository(db_session)
    now = _now_utc()

    # 1. Initially no profile
    assert await repo.get_profile() is None

    # 2. Create profile
    p_input = ApplicantProfileInput(
        first_name=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Morgan",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        ),
        last_name=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="Freeman",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        ),
        email=ConfirmedField[str](
            state=ValueState.PROVIDED,
            value="morgan@example.com",
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        ),
        employment_history=ConfirmedField[tuple[EmploymentEntry, ...]](
            state=ValueState.PROVIDED,
            value=(
                EmploymentEntry(
                    id=uuid4(),
                    company="Voice Studio",
                    title="Lead Narrator",
                    start_date="2010-01",
                    is_current=True,
                    responsibilities=("Narrated key documentaries",),
                ),
            ),
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        ),
        work_authorizations=ConfirmedField[tuple[WorkAuthorization, ...]](
            state=ValueState.PROVIDED,
            value=(
                WorkAuthorization(
                    id=uuid4(),
                    jurisdiction="US",
                    authorized=True,
                    requires_sponsorship=False,
                    last_confirmed_at=now,
                ),
            ),
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        ),
        compensation_expectation=ConfirmedField[CompensationExpectation](
            state=ValueState.PROVIDED,
            value=CompensationExpectation(
                currency="USD",
                minimum_annual=Decimal("150000"),
                target_annual=Decimal("180000"),
                last_confirmed_at=now,
            ),
            source=FieldSource.OWNER,
            last_confirmed_at=now,
        ),
    )

    created = await repo.replace_profile(p_input, expected_version=None)
    assert created.version == 1
    assert created.first_name.value == "Morgan"
    assert created.compensation_expectation.value is not None
    assert created.compensation_expectation.value.minimum_annual == Decimal("150000")

    # 3. Duplicate creation with expected_version=None rejected
    with pytest.raises(OptimisticLockError, match="already exists"):
        await repo.replace_profile(p_input, expected_version=None)

    # 4. CAS Update with stale version rejected
    with pytest.raises(OptimisticLockError, match="expected version 99"):
        await repo.replace_profile(p_input, expected_version=99)

    # 5. Successful CAS Update with expected_version=1 -> version becomes 2
    updated = await repo.replace_profile(p_input, expected_version=1)
    assert updated.version == 2


async def test_resume_asset_repository_defaults_and_constraints(
    db_session: AsyncSession,
) -> None:
    repo = ApplicantVaultRepository(db_session)

    # 1. Create first resume -> automatically is_default=True
    r1_input = ResumeAssetInput(
        resume_id="res_01",
        label="General Resume",
        source_markdown_path="docs/resume/res1.md",
        upload_pdf_path="docs/resume/res1.pdf",
        is_default=False,
    )
    r1 = await repo.create_resume(r1_input, sha256="a" * 64, file_size_bytes=1024)
    assert r1.is_default is True
    assert r1.version == 1

    # 2. Create second resume with is_default=True -> toggles r1 to False
    r2_input = ResumeAssetInput(
        resume_id="res_02",
        label="Backend Resume",
        source_markdown_path="docs/resume/res2.md",
        upload_pdf_path="docs/resume/res2.pdf",
        is_default=True,
    )
    r2 = await repo.create_resume(r2_input, sha256="b" * 64, file_size_bytes=2048)
    assert r2.is_default is True

    # Reload r1
    r1_reloaded = await repo.get_resume("res_01")
    assert r1_reloaded is not None
    assert r1_reloaded.is_default is False

    # Check database level count of default resumes
    default_count = await db_session.scalar(
        select(func.count())
        .select_from(orm.ResumeAsset)
        .where(orm.ResumeAsset.is_default.is_(True))
    )
    assert default_count == 1

    # 3. Update r1 with expected_version
    r1_updated = await repo.update_resume(
        "res_01", label="General Resume v2", expected_version=1
    )
    assert r1_updated.label == "General Resume v2"
    assert r1_updated.version == 2

    # 4. Delete default resume when other exists is rejected
    with pytest.raises(
        DefaultResumeConflictError, match="Cannot delete default resume"
    ):
        await repo.delete_resume("res_02", expected_version=1)

    # 5. Delete non-default resume succeeds
    await repo.delete_resume("res_01", expected_version=2)
    assert await repo.get_resume("res_01") is None

    # 6. Delete remaining default resume succeeds
    await repo.delete_resume("res_02", expected_version=1)
    assert await repo.get_resume("res_02") is None


async def test_reusable_answers_repository_crud_and_filtering(
    db_session: AsyncSession,
) -> None:
    repo = ApplicantVaultRepository(db_session)
    now = _now_utc()

    ans1_in = ReusableAnswerInput(
        answer_id="ans_work_auth_us",
        question_intent=QuestionIntent.WORK_AUTHORIZATION,
        jurisdiction="US",
        answer_text="Authorized to work via B2B contract",
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=now,
    )
    ans2_in = ReusableAnswerInput(
        answer_id="ans_notice_period",
        question_intent=QuestionIntent.NOTICE_PERIOD,
        jurisdiction=None,
        answer_text="Immediate availability / 2 weeks notice",
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=now,
    )

    ans1 = await repo.create_answer(ans1_in)
    ans2 = await repo.create_answer(ans2_in)
    assert ans1.version == 1
    assert ans2.version == 1

    # Filter by intent
    auth_list = await repo.list_answers(
        question_intent=QuestionIntent.WORK_AUTHORIZATION
    )
    assert len(auth_list) == 1
    assert auth_list[0].answer_id == "ans_work_auth_us"

    # Filter by jurisdiction
    us_list = await repo.list_answers(jurisdiction="US")
    assert len(us_list) == 1

    # Update with expected_version
    ans1_up = ReusableAnswerInput(
        answer_id="ans_work_auth_us",
        question_intent=QuestionIntent.WORK_AUTHORIZATION,
        jurisdiction="US",
        answer_text="Authorized to work in US via C2C/B2B",
        policy_category=PolicyCategory.APPROVED_REUSABLE,
        provenance="owner_authored",
        last_confirmed_at=now,
    )
    ans1_updated = await repo.update_answer(
        "ans_work_auth_us", ans1_up, expected_version=1
    )
    assert ans1_updated.version == 2

    # Delete with expected_version
    await repo.delete_answer("ans_work_auth_us", expected_version=2)
    assert await repo.get_answer("ans_work_auth_us") is None


def test_applicant_vault_migration_upgrade_and_downgrade(
    disposable_database_url: str,
) -> None:
    cfg = alembic_config(disposable_database_url)

    # 1. Upgrade to head
    command.upgrade(cfg, "head")

    # 2. Downgrade to 0002_normalization_identity
    command.downgrade(cfg, "0002_normalization_identity")

    # 3. Re-upgrade to head
    command.upgrade(cfg, "head")
