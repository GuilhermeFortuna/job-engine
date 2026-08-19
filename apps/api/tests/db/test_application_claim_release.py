"""Targeted claiming, claim release, and the attempt/retry counter split."""

from datetime import UTC, datetime
from uuid import UUID, uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.repositories import (
    ApplicantVaultRepository,
    ApplicationRepository,
    ApplicationRunInput,
    ApplicationRunNotFoundError,
    CatalogRepository,
    ClaimNotReleasableError,
    GrantAlreadyConsumedError,
    LeaseExpiredOrInvalidError,
)
from job_engine.domain.applicant import ResumeAssetInput
from job_engine.domain.applications import (
    ApplicationRunStatus,
    AutomationMode,
    EvidenceType,
    RunCheckpoint,
    RunnerReleaseReason,
    calculate_token_hash,
)
from job_engine.domain.enums import EmploymentType, JobStatus, RemoteStatus, Seniority
from job_engine.domain.jobs import Compensation, JobGroupInput

RELEASE_REASON = RunnerReleaseReason.UNSUPPORTED_AUTOMATION_MODE


async def _create_job_group(session: AsyncSession, slug: str) -> UUID:
    group = await CatalogRepository(session).create_job_group(
        JobGroupInput(
            title=f"Engineer {slug}",
            title_original=f"Engineer {slug}",
            title_comparison_key=f"engineer {slug}",
            company=f"Acme {slug}",
            company_original=f"Acme {slug}",
            company_comparison_key=f"acme {slug}",
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
    return group.id


async def _create_resume(session: AsyncSession) -> UUID:
    resume = await ApplicantVaultRepository(session).create_resume(
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
    return resume.id


async def _make_run(
    repo: ApplicationRepository,
    job_group_id: UUID,
    resume_id: UUID,
    slug: str,
    automation_mode: AutomationMode = AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
) -> UUID:
    run = await repo.create_run(
        ApplicationRunInput(
            job_group_id=job_group_id,
            source_posting_id=None,
            canonical_application_url=f"https://boards.example.com/acme/{slug}",
            application_url=f"https://boards.example.com/acme/{slug}",
            platform_adapter_id="generic",
            resume_asset_id=resume_id,
            resume_sha256="a" * 64,
            applicant_profile_version=1,
            answer_bank_snapshot={},
            answer_bank_hash="b" * 64,
            automation_mode=automation_mode,
            idempotency_key=slug.ljust(64, "0"),
        )
    )
    return run.id


# --- Targeted claim ---------------------------------------------------------


async def test_targeted_claim_selects_exactly_the_requested_run(
    db_session: AsyncSession,
) -> None:
    resume_id = await _create_resume(db_session)
    group_old = await _create_job_group(db_session, "old")
    group_new = await _create_job_group(db_session, "new")
    repo = ApplicationRepository(db_session)

    older = await _make_run(repo, group_old, resume_id, "older")
    newer = await _make_run(repo, group_new, resume_id, "newer")

    # The newer run is not the FIFO head, but a targeted claim must take it.
    claimed = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=calculate_token_hash("token_targeted"),
        lease_duration_seconds=60,
        max_concurrency=1,
        run_id=newer,
    )
    assert claimed is not None
    assert claimed[0].id == newer

    still_queued = await repo.get_run(older)
    assert still_queued is not None
    assert still_queued.status == ApplicationRunStatus.QUEUED


async def test_targeted_claim_returns_none_when_run_not_queued(
    db_session: AsyncSession,
) -> None:
    resume_id = await _create_resume(db_session)
    group_a = await _create_job_group(db_session, "a")
    group_b = await _create_job_group(db_session, "b")
    repo = ApplicationRepository(db_session)

    target = await _make_run(repo, group_a, resume_id, "target")
    other = await _make_run(repo, group_b, resume_id, "other")

    first = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=calculate_token_hash("token_first"),
        lease_duration_seconds=60,
        max_concurrency=2,
        run_id=target,
    )
    assert first is not None

    # Already claimed: a targeted claim yields nothing and never substitutes
    # the other queued run.
    again = await repo.claim_next_run(
        runner_id="runner_2",
        lease_token_hash=calculate_token_hash("token_again"),
        lease_duration_seconds=60,
        max_concurrency=2,
        run_id=target,
    )
    assert again is None

    untouched = await repo.get_run(other)
    assert untouched is not None
    assert untouched.status == ApplicationRunStatus.QUEUED


async def test_untargeted_claim_preserves_fifo(db_session: AsyncSession) -> None:
    resume_id = await _create_resume(db_session)
    group_old = await _create_job_group(db_session, "old")
    group_new = await _create_job_group(db_session, "new")
    repo = ApplicationRepository(db_session)

    older = await _make_run(repo, group_old, resume_id, "older")
    await _make_run(repo, group_new, resume_id, "newer")

    claimed = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=calculate_token_hash("token_fifo"),
        lease_duration_seconds=60,
        max_concurrency=1,
    )
    assert claimed is not None
    assert claimed[0].id == older


# --- Release ----------------------------------------------------------------


@pytest.mark.parametrize("advance_to_running", [False, True])
async def test_release_requeues_run_and_kills_grant(
    db_session: AsyncSession, advance_to_running: bool
) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "rel")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "release")

    token = "token_release"
    thash = calculate_token_hash(token)
    claimed = await repo.claim_next_run(
        runner_id="runner_1",
        lease_token_hash=thash,
        lease_duration_seconds=60,
        max_concurrency=1,
        run_id=run_id,
    )
    assert claimed is not None
    _, grant, raw_grant_token = claimed

    if advance_to_running:
        await repo.record_checkpoint(
            run_id,
            lease_token_hash=thash,
            checkpoint=RunCheckpoint.FORM_DISCOVERED.value,
        )
        current = await repo.get_run(run_id)
        assert current is not None
        assert current.status == ApplicationRunStatus.RUNNING

    released = await repo.release_claim(
        run_id=run_id,
        lease_token_hash=thash,
        runner_id="runner_1",
        reason=RELEASE_REASON.value,
        request_id="idem-1",
    )
    assert released.status == ApplicationRunStatus.QUEUED
    assert released.lease_token_hash is None
    assert released.lease_expires_at is None

    # The grant issued with the released lease is dead.
    with pytest.raises(GrantAlreadyConsumedError):
        await repo.consume_resume_grant(run_id, calculate_token_hash(raw_grant_token))
    assert grant.consumed_at is None  # the value returned at claim time


async def test_release_rejects_invalid_and_expired_lease(
    db_session: AsyncSession,
) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "bad")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "badlease")

    thash = calculate_token_hash("token_good")
    assert (
        await repo.claim_next_run(
            runner_id="runner_1",
            lease_token_hash=thash,
            lease_duration_seconds=60,
            max_concurrency=1,
            run_id=run_id,
        )
        is not None
    )

    with pytest.raises(LeaseExpiredOrInvalidError):
        await repo.release_claim(
            run_id=run_id,
            lease_token_hash=calculate_token_hash("token_wrong"),
            runner_id="runner_1",
            reason=RELEASE_REASON.value,
            request_id="idem-1",
        )

    await repo.heartbeat_lease(run_id, lease_token_hash=thash, extend_seconds=-120)
    with pytest.raises(LeaseExpiredOrInvalidError):
        await repo.release_claim(
            run_id=run_id,
            lease_token_hash=thash,
            runner_id="runner_1",
            reason=RELEASE_REASON.value,
            request_id="idem-1",
        )


async def test_release_refused_after_submit_attempt(db_session: AsyncSession) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "sub")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "submitting")

    thash = calculate_token_hash("token_submit")
    assert (
        await repo.claim_next_run(
            runner_id="runner_1",
            lease_token_hash=thash,
            lease_duration_seconds=60,
            max_concurrency=1,
            run_id=run_id,
        )
        is not None
    )
    await repo.record_checkpoint(
        run_id,
        lease_token_hash=thash,
        checkpoint=RunCheckpoint.SUBMITTING.value,
    )

    with pytest.raises(ClaimNotReleasableError):
        await repo.release_claim(
            run_id=run_id,
            lease_token_hash=thash,
            runner_id="runner_1",
            reason=RELEASE_REASON.value,
            request_id="idem-1",
        )


async def test_release_refused_for_terminal_run(db_session: AsyncSession) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "term")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "terminal")

    thash = calculate_token_hash("token_terminal")
    assert (
        await repo.claim_next_run(
            runner_id="runner_1",
            lease_token_hash=thash,
            lease_duration_seconds=60,
            max_concurrency=1,
            run_id=run_id,
        )
        is not None
    )
    await repo.complete_run(
        run_id=run_id,
        lease_token_hash=thash,
        terminal_status=ApplicationRunStatus.CANCELLED,
        terminal_reason="Owner cancelled",
    )

    with pytest.raises(ClaimNotReleasableError):
        await repo.release_claim(
            run_id=run_id,
            lease_token_hash=thash,
            runner_id="runner_1",
            reason=RELEASE_REASON.value,
            request_id="idem-1",
        )


# --- Release idempotency ----------------------------------------------------


async def _claim_and_release(
    repo: ApplicationRepository,
    run_id: UUID,
    token: str,
    *,
    runner_id: str = "runner_1",
    request_id: str = "idem-1",
) -> str:
    thash = calculate_token_hash(token)
    assert (
        await repo.claim_next_run(
            runner_id=runner_id,
            lease_token_hash=thash,
            lease_duration_seconds=60,
            max_concurrency=1,
            run_id=run_id,
        )
        is not None
    )
    await repo.release_claim(
        run_id=run_id,
        lease_token_hash=thash,
        runner_id=runner_id,
        reason=RELEASE_REASON.value,
        request_id=request_id,
    )
    return thash


async def test_identical_release_replay_is_a_no_op(db_session: AsyncSession) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "idem")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "idempotent")

    thash = await _claim_and_release(repo, run_id, "token_idem")
    first = await repo.get_run(run_id)
    assert first is not None

    replay = await repo.release_claim(
        run_id=run_id,
        lease_token_hash=thash,
        runner_id="runner_1",
        reason=RELEASE_REASON.value,
        request_id="idem-1",
    )
    assert replay.status == ApplicationRunStatus.QUEUED
    assert replay.attempt_count == first.attempt_count
    assert replay.updated_at == first.updated_at

    # Exactly one release event was recorded.
    events = [e for e in replay.events if e.event_type == "lease_released"]
    assert len(events) == 1


@pytest.mark.parametrize(
    ("runner_id", "reason", "request_id"),
    [
        ("runner_impostor", RELEASE_REASON.value, "idem-1"),
        ("runner_1", RunnerReleaseReason.RUNTIME_UNAVAILABLE.value, "idem-1"),
        ("runner_1", RELEASE_REASON.value, "idem-other"),
    ],
    ids=["spoofed_runner", "wrong_reason", "wrong_request_id"],
)
async def test_release_replay_requires_full_identity_match(
    db_session: AsyncSession, runner_id: str, reason: str, request_id: str
) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "spoof")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "spoofed")

    thash = await _claim_and_release(repo, run_id, "token_spoof")

    # Holding the correct lease token is not enough on its own.
    with pytest.raises(LeaseExpiredOrInvalidError):
        await repo.release_claim(
            run_id=run_id,
            lease_token_hash=thash,
            runner_id=runner_id,
            reason=reason,
            request_id=request_id,
        )


async def test_release_token_stops_working_after_reclaim(
    db_session: AsyncSession,
) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "reclaim")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "reclaimed")

    thash = await _claim_and_release(repo, run_id, "token_old")

    # A later claim retires the release record.
    assert (
        await repo.claim_next_run(
            runner_id="runner_1",
            lease_token_hash=calculate_token_hash("token_new"),
            lease_duration_seconds=60,
            max_concurrency=1,
            run_id=run_id,
        )
        is not None
    )

    with pytest.raises(LeaseExpiredOrInvalidError):
        await repo.release_claim(
            run_id=run_id,
            lease_token_hash=thash,
            runner_id="runner_1",
            reason=RELEASE_REASON.value,
            request_id="idem-1",
        )


# --- Attempt identity and retry accounting ----------------------------------


async def test_reclaim_after_release_uses_a_fresh_attempt_number(
    db_session: AsyncSession,
) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "attempt")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "attempts")

    await _claim_and_release(repo, run_id, "token_attempt_1")
    after_release = await repo.get_run(run_id)
    assert after_release is not None
    first_attempt = after_release.attempt_count

    assert (
        await repo.claim_next_run(
            runner_id="runner_1",
            lease_token_hash=calculate_token_hash("token_attempt_2"),
            lease_duration_seconds=60,
            max_concurrency=1,
            run_id=run_id,
        )
        is not None
    )
    reclaimed = await repo.get_run(run_id)
    assert reclaimed is not None
    # attempt_count is identity, so it only ever moves forward.
    assert reclaimed.attempt_count == first_attempt + 1

    # Evidence from both attempts coexists under distinct attempt directories,
    # so the new attempt cannot overwrite the old one's audit trail.
    old_artifact = await repo.add_evidence_artifact(
        run_id=run_id,
        attempt=first_attempt,
        evidence_type=EvidenceType.LOG,
        relative_path=f"runs/{run_id}/attempt_{first_attempt}/log.txt",
        sha256="c" * 64,
        file_size_bytes=10,
    )
    new_artifact = await repo.add_evidence_artifact(
        run_id=run_id,
        attempt=reclaimed.attempt_count,
        evidence_type=EvidenceType.LOG,
        relative_path=f"runs/{run_id}/attempt_{reclaimed.attempt_count}/log.txt",
        sha256="d" * 64,
        file_size_bytes=10,
    )
    assert old_artifact.relative_path != new_artifact.relative_path
    assert old_artifact.attempt != new_artifact.attempt


async def test_release_does_not_consume_retry_budget(
    db_session: AsyncSession,
) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "retry")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "retrybudget")

    # Far more releases than max_retries (2).
    for index in range(5):
        await _claim_and_release(
            repo, run_id, f"token_retry_{index}", request_id=f"idem-{index}"
        )
        current = await repo.get_run(run_id)
        assert current is not None
        assert current.status == ApplicationRunStatus.QUEUED
        assert current.retry_failure_count == 0

    final = await repo.get_run(run_id)
    assert final is not None
    assert final.status == ApplicationRunStatus.QUEUED
    assert final.attempt_count == 5


async def test_lease_expiry_still_exhausts_retries(db_session: AsyncSession) -> None:
    resume_id = await _create_resume(db_session)
    group = await _create_job_group(db_session, "expire")
    repo = ApplicationRepository(db_session)
    run_id = await _make_run(repo, group, resume_id, "expiring")

    # max_retries defaults to 2: the first expiry requeues, the second fails.
    for expected_failures, expected_status in (
        (1, ApplicationRunStatus.QUEUED),
        (2, ApplicationRunStatus.FAILED_FINAL),
    ):
        assert (
            await repo.claim_next_run(
                runner_id="runner_1",
                lease_token_hash=calculate_token_hash(f"tok_{expected_failures}"),
                lease_duration_seconds=-10,
                max_concurrency=1,
                run_id=run_id,
            )
            is not None
        )
        await repo.reclaim_expired_leases()
        current = await repo.get_run(run_id)
        assert current is not None
        assert current.retry_failure_count == expected_failures
        assert current.status == expected_status


async def test_release_claim_rejects_unknown_run(db_session: AsyncSession) -> None:
    repo = ApplicationRepository(db_session)
    with pytest.raises(ApplicationRunNotFoundError):
        await repo.release_claim(
            run_id=uuid4(),
            lease_token_hash=calculate_token_hash("token_missing"),
            runner_id="runner_1",
            reason=RELEASE_REASON.value,
            request_id="idem-1",
        )
