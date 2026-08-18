from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.repositories import (
    ApplicantVaultRepository,
    ApplicationRepository,
    ApplicationRunFilterCriteria,
    ApplicationRunInput,
    CatalogRepository,
    DuplicateApplicationError,
    GrantAlreadyConsumedError,
    LeaseExpiredOrInvalidError,
)
from job_engine.domain.applicant import ResumeAssetInput
from job_engine.domain.applications import (
    ApplicationRunStatus,
    AutomationMode,
    ExceptionType,
    ReceiptSummary,
    RunCheckpoint,
    calculate_token_hash,
)
from job_engine.domain.enums import EmploymentType, JobStatus, RemoteStatus, Seniority
from job_engine.domain.jobs import Compensation, JobGroupInput


async def _create_test_fixtures(session: AsyncSession) -> tuple[UUID, UUID]:
    cat_repo = CatalogRepository(session)
    group = await cat_repo.create_job_group(
        JobGroupInput(
            title="Senior Full Stack Engineer",
            title_original="Senior Full Stack Engineer",
            title_comparison_key="senior full stack engineer",
            company="Acme Corp",
            company_original="Acme Corp",
            company_comparison_key="acme corp",
            description="Build amazing things",
            location_original="Remote",
            location_comparison_key="remote",
            location_normalized_country="US",
            location_normalized_region=None,
            remote_status=RemoteStatus.REMOTE,
            employment_type=EmploymentType.FULL_TIME,
            seniority=Seniority.SENIOR,
            seniority_original="Senior",
            compensation=Compensation(),
            published_at=datetime.now(UTC),
            first_seen_at=datetime.now(UTC),
            last_seen_at=datetime.now(UTC),
            closed_at=None,
            status=JobStatus.ACTIVE,
            location_eligibility_unknown=False,
            last_ingestion_run_id=None,
        )
    )

    vault_repo = ApplicantVaultRepository(session)
    resume = await vault_repo.create_resume(
        ResumeAssetInput(
            resume_id="res_test_default",
            label="Test Resume",
            source_markdown_path="test.md",
            upload_pdf_path="test.pdf",
            language="en",
            is_default=True,
        ),
        sha256="a" * 64,
    )

    return group.id, resume.id


async def test_application_run_crud_and_duplicate_prevention(
    db_session: AsyncSession,
) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)

    run_input = ApplicationRunInput(
        job_group_id=job_id,
        source_posting_id=None,
        canonical_application_url="https://boards.greenhouse.io/acme/jobs/101",
        application_url="https://boards.greenhouse.io/acme/jobs/101?gh_jid=101",
        platform_adapter_id="greenhouse",
        resume_asset_id=resume_id,
        resume_sha256="a" * 64,
        applicant_profile_version=1,
        answer_bank_snapshot={"ans_work_auth": 1},
        answer_bank_hash="b" * 64,
        automation_mode=AutomationMode.FULL_AUTO,
        idempotency_key="c" * 64,
    )

    # 1. Create run
    run1 = await repo.create_run(run_input)
    assert run1.status == ApplicationRunStatus.QUEUED
    assert (
        run1.canonical_application_url == "https://boards.greenhouse.io/acme/jobs/101"
    )

    # 2. Duplicate active run attempt raises DuplicateApplicationError
    with pytest.raises(DuplicateApplicationError):
        await repo.create_run(run_input)

    # 3. List runs with filter
    runs, total = await repo.list_runs(
        ApplicationRunFilterCriteria(statuses=(ApplicationRunStatus.QUEUED,))
    )
    assert total == 1
    assert len(runs) == 1
    assert runs[0].id == run1.id

    # 4. Duplicate override allows creating a new run
    override_now = datetime.now(UTC)
    override_input = ApplicationRunInput(
        job_group_id=job_id,
        source_posting_id=None,
        canonical_application_url="https://boards.greenhouse.io/acme/jobs/101",
        application_url="https://boards.greenhouse.io/acme/jobs/101",
        platform_adapter_id="greenhouse",
        resume_asset_id=resume_id,
        resume_sha256="a" * 64,
        applicant_profile_version=1,
        answer_bank_snapshot={"ans_work_auth": 1},
        answer_bank_hash="b" * 64,
        automation_mode=AutomationMode.FULL_AUTO,
        idempotency_key="d" * 64,
        duplicate_override_confirmed_at=override_now,
        duplicate_override_reason="Re-submitting with updated answers",
    )
    run2 = await repo.create_run(override_input)
    assert run2.id != run1.id
    assert run2.duplicate_override_confirmed_at == override_now


async def test_runner_claim_lease_heartbeat_and_events(
    db_session: AsyncSession,
) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)

    run = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_id,
            source_posting_id=None,
            canonical_application_url="https://jobs.lever.co/acme/202",
            application_url="https://jobs.lever.co/acme/202",
            platform_adapter_id="lever",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.FULL_AUTO,
            idempotency_key="e" * 64,
        )
    )

    runner_token = "runner-lease-token-12345"
    lease_token_hash = calculate_token_hash(runner_token)

    # 1. Claim run
    claim_result = await repo.claim_next_run(
        runner_id="runner_node_1",
        lease_token_hash=lease_token_hash,
        lease_duration_seconds=60,
        max_concurrency=1,
    )
    assert claim_result is not None
    claimed_run, grant, raw_grant_token = claim_result
    assert claimed_run.id == run.id
    assert claimed_run.status == ApplicationRunStatus.CLAIMED
    assert claimed_run.attempt_count == 1
    assert claimed_run.lease_token_hash == lease_token_hash
    assert grant.consumed_at is None

    # 2. Concurrency limit prevents second claim while active
    second_claim = await repo.claim_next_run(
        runner_id="runner_node_2",
        lease_token_hash=calculate_token_hash("token2"),
        lease_duration_seconds=60,
        max_concurrency=1,
    )
    assert second_claim is None

    # 3. Heartbeat extends lease
    hb_run = await repo.heartbeat_lease(
        run.id, lease_token_hash=lease_token_hash, extend_seconds=120
    )
    assert hb_run.lease_expires_at is not None

    # 4. Checkpoint records pre-click marker
    chk_run = await repo.record_checkpoint(
        run.id,
        lease_token_hash=lease_token_hash,
        checkpoint=RunCheckpoint.PROFILE_FILLED.value,
        step_description="Candidate profile entered",
    )
    assert chk_run.status == ApplicationRunStatus.RUNNING
    assert chk_run.current_checkpoint == "profile_filled"

    # 5. Monotonic event append and idempotency deduplication
    ev1 = await repo.append_event(
        run.id,
        lease_token_hash=lease_token_hash,
        attempt=1,
        sequence_num=5,  # 1: RUN_CREATED, 2: LEASE_CLAIMED, 3: LEASE_EXTENDED...
        event_type="field_filled",
        payload={"field": "first_name", "value": "Guilherme"},
        idempotency_key="field_first_name",
    )
    assert ev1.sequence_num == 5

    # Idempotent replay of same idempotency_key returns existing event
    ev1_dup = await repo.append_event(
        run.id,
        lease_token_hash=lease_token_hash,
        attempt=1,
        sequence_num=5,
        event_type="field_filled",
        payload={"field": "first_name", "value": "Guilherme"},
        idempotency_key="field_first_name",
    )
    assert ev1_dup.id == ev1.id


async def test_expired_lease_cannot_append_events_or_complete(
    db_session: AsyncSession,
) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)
    run = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_id,
            source_posting_id=None,
            canonical_application_url="https://jobs.lever.co/acme/expired",
            application_url="https://jobs.lever.co/acme/expired",
            platform_adapter_id="lever",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.FULL_AUTO,
            idempotency_key="9" * 64,
        )
    )
    lease_hash = calculate_token_hash("expired-lease")
    claimed = await repo.claim_next_run(
        runner_id="runner_expired",
        lease_token_hash=lease_hash,
        lease_duration_seconds=-1,
        max_concurrency=1,
    )
    assert claimed is not None

    with pytest.raises(LeaseExpiredOrInvalidError):
        await repo.append_event(
            run.id,
            lease_token_hash=lease_hash,
            attempt=1,
            sequence_num=3,
            event_type="stale_event",
            payload={},
        )
    with pytest.raises(LeaseExpiredOrInvalidError):
        await repo.complete_run(
            run.id,
            lease_token_hash=lease_hash,
            terminal_status=ApplicationRunStatus.FAILED_FINAL,
        )


async def test_provider_budget_reservation_is_durable_and_capped(
    db_session: AsyncSession,
) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)
    run = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_id,
            source_posting_id=None,
            canonical_application_url="https://boards.greenhouse.io/acme/jobs/budget",
            application_url="https://boards.greenhouse.io/acme/jobs/budget",
            platform_adapter_id="greenhouse",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.FULL_AUTO,
            idempotency_key="8" * 64,
        )
    )

    for _ in range(5):
        assert await repo.reserve_provider_budget(
            run.id,
            Decimal("0.01"),
            max_calls_per_run=5,
            run_cost_cap_usd=Decimal("0.05"),
            batch_cost_cap_usd=Decimal("5.00"),
        )
    assert not await repo.reserve_provider_budget(
        run.id,
        Decimal("0.01"),
        max_calls_per_run=5,
        run_cost_cap_usd=Decimal("0.05"),
        batch_cost_cap_usd=Decimal("5.00"),
    )


async def test_crash_safety_and_lease_expiry_reclaim(db_session: AsyncSession) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)

    # --- Scenario A: Crash BEFORE submit click -> Reclaims to QUEUED ---
    run_a = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_id,
            source_posting_id=None,
            canonical_application_url="https://boards.greenhouse.io/acme/jobs/301",
            application_url="https://boards.greenhouse.io/acme/jobs/301",
            platform_adapter_id="greenhouse",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.FULL_AUTO,
            idempotency_key="f" * 64,
        )
    )

    token_a = "token_a"
    thash_a = calculate_token_hash(token_a)
    claim_a = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=thash_a,
        lease_duration_seconds=-10,  # expired immediately
        max_concurrency=1,
    )
    assert claim_a is not None

    # Runner reclaimed because lease expired and submit_attempted_at is None
    reclaimed = await repo.reclaim_expired_leases()
    assert reclaimed >= 1
    reloaded_a = await repo.get_run(run_a.id)
    assert reloaded_a is not None
    assert reloaded_a.status == ApplicationRunStatus.QUEUED  # requeued for retry

    # --- Scenario B: Crash AFTER submit checkpoint -> SUBMISSION_UNKNOWN ---
    # Re-claim run_a
    claim_b = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=thash_a,
        lease_duration_seconds=60,
        max_concurrency=1,
    )
    assert claim_b is not None
    # Runner sets checkpoint to SUBMITTING immediately before click
    await repo.record_checkpoint(
        run_a.id,
        lease_token_hash=thash_a,
        checkpoint=RunCheckpoint.SUBMITTING.value,
        step_description="Submitting application form",
    )
    # Simulate timeout / crash: manually expire lease
    await repo.heartbeat_lease(run_a.id, lease_token_hash=thash_a, extend_seconds=-10)

    # Reclaim must mark SUBMISSION_UNKNOWN and NEVER QUEUED
    await repo.reclaim_expired_leases()
    reloaded_b = await repo.get_run(run_a.id)
    assert reloaded_b is not None
    assert reloaded_b.status == ApplicationRunStatus.SUBMISSION_UNKNOWN
    assert "submit attempt without confirmed receipt" in (
        reloaded_b.terminal_reason or ""
    )


async def test_single_use_resume_grant_and_receipt_completion(
    db_session: AsyncSession,
) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)

    run = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_id,
            source_posting_id=None,
            canonical_application_url="https://jobs.lever.co/acme/401",
            application_url="https://jobs.lever.co/acme/401",
            platform_adapter_id="lever",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.FULL_AUTO,
            idempotency_key="g" * 64,
        )
    )

    token = "token_c"
    thash = calculate_token_hash(token)
    claim_res = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=thash,
        lease_duration_seconds=60,
        max_concurrency=1,
    )
    assert claim_res is not None
    _, grant, raw_grant_token = claim_res

    # 1. Consume resume grant once -> Success
    grant_hash = calculate_token_hash(raw_grant_token)
    consumed = await repo.consume_resume_grant(run.id, grant_hash)
    assert consumed.consumed_at is not None

    # 2. Replay attempt -> Replay rejected with GrantAlreadyConsumedError
    with pytest.raises(GrantAlreadyConsumedError):
        await repo.consume_resume_grant(run.id, grant_hash)

    # 3. Complete run with verified receipt summary
    now = datetime.now(UTC)
    receipt = ReceiptSummary(
        platform_adapter_id="lever",
        final_url="https://jobs.lever.co/acme/401/thanks",
        platform_receipt_id="lever_rec_555",
        confirmation_signal="Thank you for applying!",
        capture_timestamp=now,
        artifact_hash="e" * 64,
    )

    completed = await repo.complete_run(
        run.id,
        lease_token_hash=thash,
        terminal_status=ApplicationRunStatus.SUBMITTED,
        receipt_summary=receipt,
    )
    assert completed.status == ApplicationRunStatus.SUBMITTED
    assert completed.receipt_summary is not None
    assert completed.receipt_summary.platform_receipt_id == "lever_rec_555"


async def test_semi_auto_pause_and_release_submit(db_session: AsyncSession) -> None:
    job_id, resume_id = await _create_test_fixtures(db_session)
    repo = ApplicationRepository(db_session)

    run = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_id,
            source_posting_id=None,
            canonical_application_url="https://boards.greenhouse.io/acme/jobs/501",
            application_url="https://boards.greenhouse.io/acme/jobs/501",
            platform_adapter_id="greenhouse",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
            idempotency_key="h" * 64,
        )
    )

    token = "token_semi"
    thash = calculate_token_hash(token)
    claim_res = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=thash,
        lease_duration_seconds=60,
        max_concurrency=1,
    )
    assert claim_res is not None

    # Runner arms submission and pauses for owner review
    await repo.record_checkpoint(
        run.id,
        lease_token_hash=thash,
        checkpoint=RunCheckpoint.SUBMIT_ARMED.value,
        step_description="Form completed, ready for submission",
    )
    await repo.raise_exception(
        run.id,
        lease_token_hash=thash,
        exception_type=ExceptionType.SEMI_AUTO_ARMED,
        context_payload={"summary": "Please review before final submit click"},
    )

    paused_run = await repo.get_run(run.id)
    assert paused_run is not None
    assert paused_run.status == ApplicationRunStatus.NEEDS_INPUT
    assert paused_run.current_checkpoint == "submit_armed"

    # User releases submit
    released = await repo.release_submit(
        run.id, owner_confirmation="I confirm and approve submission"
    )
    assert released.status == ApplicationRunStatus.QUEUED
