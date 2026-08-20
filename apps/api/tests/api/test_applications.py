import hashlib
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.api.schemas import ApplicationRunCreateRequest
from job_engine.config import Settings
from job_engine.db.repositories import (
    ApplicantVaultRepository,
    CatalogRepository,
)
from job_engine.domain.applicant import (
    ApplicantProfileInput,
    ConfirmedField,
    FieldSource,
    PolicyCategory,
    QuestionIntent,
    ResumeAssetInput,
    ReusableAnswerInput,
    ValueState,
)
from job_engine.domain.applications import (
    FULL_AUTO_OWNER_CONFIRMATION,
    ApplicationRunStatus,
    AutomationMode,
    EvidenceType,
    ExceptionType,
    RunCheckpoint,
)
from job_engine.domain.enums import EmploymentType, JobStatus, RemoteStatus, Seniority
from job_engine.domain.jobs import Compensation, JobGroupInput, SourcePostingInput
from job_engine.services.applications import ApplicationService


async def _setup_fixtures(
    session: AsyncSession, settings: Settings
) -> tuple[UUID, str, str]:
    # 1. Profile
    vault_repo = ApplicantVaultRepository(session)
    now = datetime.now(UTC)
    await vault_repo.replace_profile(
        ApplicantProfileInput(
            first_name=ConfirmedField(
                value="Dakota",
                source=FieldSource.OWNER,
                state=ValueState.PROVIDED,
                last_confirmed_at=now,
                policy_category=PolicyCategory.VERIFIED_PROFILE,
            ),
            last_name=ConfirmedField(
                value="Fortuna",
                source=FieldSource.OWNER,
                state=ValueState.PROVIDED,
                last_confirmed_at=now,
                policy_category=PolicyCategory.VERIFIED_PROFILE,
            ),
            email=ConfirmedField(
                value="gui@example.com",
                source=FieldSource.OWNER,
                state=ValueState.PROVIDED,
                last_confirmed_at=now,
                policy_category=PolicyCategory.VERIFIED_PROFILE,
            ),
        ),
        expected_version=None,
    )

    # 2. Reusable answer
    await vault_repo.create_answer(
        ReusableAnswerInput(
            answer_id="ans_salary_exp",
            question_intent=QuestionIntent.COMPENSATION_EXPECTATION,
            jurisdiction=None,
            platform_scope=None,
            answer_text="$150,000 USD",
            policy_category=PolicyCategory.APPROVED_REUSABLE,
            provenance="owner_authored",
            last_confirmed_at=datetime.now(UTC),
        )
    )

    # 3. Resume PDF on disk
    resume_root = settings.resolved_resume_root
    resume_root.mkdir(parents=True, exist_ok=True)
    pdf_path = resume_root / "test_resume.pdf"
    pdf_content = b"%PDF-1.4 test resume mock bytes"
    pdf_path.write_bytes(pdf_content)
    pdf_sha256 = hashlib.sha256(pdf_content).hexdigest()

    resume = await vault_repo.create_resume(
        ResumeAssetInput(
            resume_id="res_primary_pdf",
            label="Primary Software Engineer Resume",
            source_markdown_path="test_resume.md",
            upload_pdf_path="test_resume.pdf",
            language="en",
            is_default=True,
        ),
        sha256=pdf_sha256,
    )

    # 4. Job group & Source Posting
    cat_repo = CatalogRepository(session)
    group = await cat_repo.create_job_group(
        JobGroupInput(
            title="Senior Backend Engineer",
            title_original="Senior Backend Engineer",
            title_comparison_key="senior backend engineer",
            company="Stripe",
            company_original="Stripe",
            company_comparison_key="stripe",
            description="Build payments infrastructure",
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
    posting = await cat_repo.upsert_source_posting(
        SourcePostingInput(
            source_id="stripe_greenhouse",
            source_posting_id="101",
            source_name="Greenhouse",
            application_url="https://boards.greenhouse.io/stripe/jobs/101?gh_jid=101",
            application_url_canonical="https://boards.greenhouse.io/stripe/jobs/101",
            title_original="Senior Backend Engineer",
            company_original="Stripe",
            description="Build payments infrastructure",
            location_original="Remote",
            remote_status=RemoteStatus.REMOTE,
            employment_type=EmploymentType.FULL_TIME,
            seniority=Seniority.SENIOR,
            first_seen_at=now,
            last_seen_at=now,
            closed_at=None,
            status=JobStatus.ACTIVE,
        )
    )
    await cat_repo.add_posting_to_group(group.id, posting.id)

    await session.commit()
    return group.id, resume.resume_id, pdf_sha256


def _full_auto_create_payload(group_id: UUID, resume_id: str) -> dict[str, object]:
    return {
        "job_group_ids": [str(group_id)],
        "resume_id": resume_id,
        "automation_mode": "full_auto",
        "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
    }


async def test_create_run_requires_explicit_automation_mode(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    """Omitting automation_mode must fail, never silently mean FULL_AUTO.

    CROSS-009 advisory A-1: the field used to default to FULL_AUTO, so any
    caller that forgot it created an unattended run.
    """
    settings: Settings = app.state.settings
    group_id, _resume_id, _sha256 = await _setup_fixtures(session, settings)

    resp = await client.post(
        "/api/v1/application-runs",
        json={"job_group_ids": [str(group_id)]},
    )

    assert resp.status_code == 422
    missing = [
        err
        for err in resp.json()["detail"]
        if err["type"] == "missing" and err["loc"][-1] == "automation_mode"
    ]
    assert missing, resp.json()

    with pytest.raises(ValidationError):
        ApplicationRunCreateRequest(job_group_ids=[group_id])  # type: ignore[call-arg]


async def test_full_auto_requires_explicit_resume_and_exact_authorization(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, _sha256 = await _setup_fixtures(session, settings)

    invalid_payloads = (
        {
            "job_group_ids": [str(group_id)],
            "resume_id": resume_id,
            "automation_mode": "full_auto",
        },
        {
            "job_group_ids": [str(group_id)],
            "resume_id": resume_id,
            "automation_mode": "full_auto",
            "owner_confirmation": "Authorize some automatic submissions",
        },
        {
            "job_group_ids": [str(group_id)],
            "automation_mode": "full_auto",
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
        {
            "job_group_ids": [str(group_id)],
            "automation_mode": "semi_auto_pause_before_submit",
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
    )
    for payload in invalid_payloads:
        response = await client.post("/api/v1/application-runs", json=payload)
        assert response.status_code == 422, response.text

    list_response = await client.get("/api/v1/application-runs")
    assert list_response.status_code == 200
    assert list_response.json()["total"] == 0


async def test_create_application_runs_and_duplicate_handling(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    # 1. Create run
    resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert resp.status_code == 201
    data = resp.json()
    assert len(data["created_runs"]) == 1
    assert len(data["conflicts"]) == 0
    run_id = data["created_runs"][0]["id"]
    assert data["created_runs"][0]["status"] == "queued"
    assert data["created_runs"][0]["automatic_submission_authorized"] is True
    assert data["created_runs"][0]["automatic_submission_authorized_at"] is not None
    assert (
        data["created_runs"][0]["canonical_application_url"]
        == "https://boards.greenhouse.io/stripe/jobs/101"
    )
    detail_response = await client.get(f"/api/v1/application-runs/{run_id}")
    assert detail_response.status_code == 200
    authorization_event = next(
        event
        for event in detail_response.json()["events"]
        if event["event_type"] == "automatic_submission_authorized"
    )
    assert authorization_event["event_payload"]["authorized_at"]
    assert "owner_confirmation" not in authorization_event["event_payload"]

    release_full_auto = await client.post(
        f"/api/v1/application-runs/{run_id}/release-submit",
        json={"owner_confirmation": "Approved by user"},
    )
    assert release_full_auto.status_code == 400

    # 2. Duplicate submission without override -> 409 Conflict
    dup_resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert dup_resp.status_code == 409
    dup_data = dup_resp.json()
    assert len(dup_data["created_runs"]) == 0
    assert len(dup_data["conflicts"]) == 1
    assert dup_data["conflicts"][0]["existing_run_id"] == run_id

    # 3. Explicitly record the owner-confirmed override on the existing run.
    override_resp = await client.post(
        f"/api/v1/application-runs/{run_id}/duplicate-override",
        json={
            "owner_confirmation": "Confirm re-apply",
            "reason": "Updated answers for new cycle",
        },
    )
    assert override_resp.status_code == 200
    assert override_resp.json()["duplicate_override_reason"] == (
        "Updated answers for new cycle"
    )

    # 4. Only after the separate audited action may creation proceed.
    replacement_resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert replacement_resp.status_code == 201
    replacement_data = replacement_resp.json()
    assert len(replacement_data["created_runs"]) == 1
    assert replacement_data["created_runs"][0]["id"] != run_id

    # 5. List runs
    list_resp = await client.get("/api/v1/application-runs?page=1&page_size=10")
    assert list_resp.status_code == 200
    list_data = list_resp.json()
    assert list_data["total"] == 2
    assert len(list_data["items"]) == 2


async def test_runner_claim_heartbeat_evidence_and_single_use_grant(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    # Create run
    create_resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert create_resp.status_code == 201
    run_id = create_resp.json()["created_runs"][0]["id"]

    runner_headers = {
        "Authorization": f"Bearer {settings.runner_secret}",
        "X-Runner-Id": "test_runner_1",
    }

    # 1. Runner claims run
    claim_resp = await client.post("/api/v1/runner/claims", headers=runner_headers)
    assert claim_resp.status_code == 200
    claim_data = claim_resp.json()
    assert claim_data["run"]["id"] == run_id
    assert claim_data["run"]["status"] == "claimed"
    assert claim_data["run"]["automatic_submission_authorized"] is True
    assert claim_data["run"]["automatic_submission_authorized_at"] is not None
    grant_token = claim_data["grant_token"]

    # 2. Download resume asset using grant token
    resume_resp = await client.get(
        f"/api/v1/runner/runs/{run_id}/resume-asset",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Resume-Grant-Token": grant_token,
        },
    )
    assert resume_resp.status_code == 200
    assert resume_resp.headers["x-resume-sha256"] == sha256
    assert resume_resp.content == b"%PDF-1.4 test resume mock bytes"

    # 3. Single-use replay protection: 2nd attempt with same grant returns 410 Gone
    resume_replay = await client.get(
        f"/api/v1/runner/runs/{run_id}/resume-asset",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Resume-Grant-Token": grant_token,
        },
    )
    assert resume_replay.status_code == 410

    # 4. Runner sends checkpoint
    chk_headers = {
        "Authorization": f"Bearer {settings.runner_secret}",
        "X-Runner-Lease-Token": "invalid-token",
    }
    chk_fail = await client.post(
        f"/api/v1/runner/runs/{run_id}/checkpoints",
        headers=chk_headers,
        json={"checkpoint": "submitting", "step_description": "Submitting form"},
    )
    assert chk_fail.status_code == 401

    # Invalid leases must not leave untracked evidence files on disk.
    invalid_filename = "unauthorized-evidence.html"
    evidence_fail = await client.post(
        f"/api/v1/runner/runs/{run_id}/evidence",
        headers=chk_headers,
        data={"attempt": "1", "evidence_type": "dom_snapshot"},
        files={"file": (invalid_filename, b"<html>private</html>", "text/html")},
    )
    assert evidence_fail.status_code == 401
    assert not (
        settings.resolved_evidence_root / f"runs/{run_id}/attempt_1/{invalid_filename}"
    ).exists()


async def test_semi_auto_pause_and_release_submit(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    # Create run in semi-auto mode
    create_resp = await client.post(
        "/api/v1/application-runs",
        json={
            "job_group_ids": [str(group_id)],
            "automation_mode": "semi_auto_pause_before_submit",
        },
    )
    assert create_resp.status_code == 201
    run_id = create_resp.json()["created_runs"][0]["id"]

    # Runner claims run
    claim_resp = await client.post(
        "/api/v1/runner/claims",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Id": "runner_semi",
        },
    )
    assert claim_resp.status_code == 200

    # Runner encounters pause exception and raises it via repository service
    from job_engine.services.applications import ApplicationService

    svc = ApplicationService(
        session_factory=app.state.session_factory, settings=settings
    )
    claimed_run = await svc.get_run(UUID(run_id))
    assert claimed_run is not None
    assert claimed_run.lease_token_hash is not None

    async with app.state.session_factory() as s:
        from job_engine.db.repositories import ApplicationRepository

        r = ApplicationRepository(s)
        await r.record_checkpoint(
            UUID(run_id),
            lease_token_hash=claimed_run.lease_token_hash,
            checkpoint=RunCheckpoint.SUBMIT_ARMED.value,
        )
        await r.raise_exception(
            UUID(run_id),
            lease_token_hash=claimed_run.lease_token_hash,
            exception_type=ExceptionType.SEMI_AUTO_ARMED,
            context_payload={"msg": "Please confirm before submit click"},
        )
        await s.commit()

    # User releases submit
    rel_resp = await client.post(
        f"/api/v1/application-runs/{run_id}/release-submit",
        json={"owner_confirmation": "Approved by user"},
    )
    assert rel_resp.status_code == 200
    assert rel_resp.json()["status"] == "queued"
    assert rel_resp.json()["automatic_submission_authorized"] is False
    armed_exception = next(
        item
        for item in rel_resp.json()["exceptions"]
        if item["exception_type"] == "semi_auto_armed"
    )
    assert armed_exception["status"] == "resolved"


async def test_anti_csrf_protection(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    # Post with Sec-Fetch-Site: cross-site is rejected with 403
    resp = await client.post(
        "/api/v1/application-runs",
        headers={"Sec-Fetch-Site": "cross-site"},
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert resp.status_code == 403
    assert "Cross-site requests forbidden" in resp.json()["detail"]

    foreign_origin = await client.post(
        "/api/v1/application-runs",
        headers={"Origin": "http://attacker.invalid"},
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert foreign_origin.status_code == 403


async def test_evidence_storage_sanitization_and_retention(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    create_resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    assert create_resp.status_code == 201

    svc = ApplicationService(
        session_factory=app.state.session_factory, settings=settings
    )
    claim_res = await svc.claim_run(runner_id="runner_ev")
    assert claim_res is not None
    run, lease_token, grant_token, _ = claim_res

    # Store DOM snapshot with sensitive input
    dom_html = (
        "<html><body><input type='password' value='supersecretpassword'></body></html>"
    )
    ev = await svc.store_evidence(
        run_id=run.id,
        lease_token=lease_token,
        attempt=1,
        evidence_type=EvidenceType.DOM_SNAPSHOT,
        file_bytes=dom_html.encode("utf-8"),
        filename="dom_snapshot.html",
    )
    assert ev.sha256 is not None

    # Check that stored file does not contain plain password
    ev_file = settings.resolved_evidence_root / ev.relative_path
    assert ev_file.is_file()
    content = ev_file.read_text(encoding="utf-8")
    assert "supersecretpassword" not in content
    assert "[REDACTED]" in content

    with pytest.raises(ValueError, match="redaction_applied"):
        await svc.store_evidence(
            run_id=run.id,
            lease_token=lease_token,
            attempt=1,
            evidence_type=EvidenceType.SCREENSHOT,
            file_bytes=b"unverified screenshot bytes",
            filename="unredacted.png",
        )
    assert not (
        settings.resolved_evidence_root / f"runs/{run.id}/attempt_1/unredacted.png"
    ).exists()


async def test_exception_resolve_answers_and_requeue(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    create_resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    run_id = create_resp.json()["created_runs"][0]["id"]

    # Runner claims run
    claim_resp = await client.post(
        "/api/v1/runner/claims",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Id": "runner_exc",
        },
    )
    claim_data = claim_resp.json()
    lease_token = claim_data["lease_token"]

    # Runner raises UNKNOWN_QUESTION exception
    exc_resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/exceptions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": lease_token,
        },
        json={
            "exception_type": "unresolved_question",
            "context_payload": {
                "page_id": "application-step-2",
                "fields": [
                    {
                        "field_fingerprint": "fp_hybrid_work",
                        "label": "Are you willing to work in hybrid mode?",
                        "control_type": "text",
                        "required": True,
                        "status": "REVIEW_REQUIRED",
                        "reason_code": "no_applicable_answer",
                        "question_intent": "location_preference",
                        "options": [],
                        "min_length": 1,
                        "max_length": 200,
                        "pattern": None,
                    }
                ],
            },
        },
    )
    assert exc_resp.status_code == 200
    exc_data = exc_resp.json()
    exception_id = exc_data["id"]

    # Verify run is in needs_input
    run_detail = await client.get(f"/api/v1/application-runs/{run_id}")
    assert run_detail.status_code == 200
    assert run_detail.json()["status"] == "needs_input"
    assert len(run_detail.json()["exceptions"]) == 1
    assert run_detail.json()["exceptions"][0]["field_reports"] == [
        {
            "field_fingerprint": "fp_hybrid_work",
            "label": "Are you willing to work in hybrid mode?",
            "control_type": "text",
            "required": True,
            "status": "REVIEW_REQUIRED",
            "reason_code": "no_applicable_answer",
            "question_intent": "location_preference",
            "options": [],
            "min_length": 1,
            "max_length": 200,
            "pattern": None,
            "allow_save_to_answer_bank": True,
        }
    ]

    wrong_field_resp = await client.post(
        f"/api/v1/application-runs/{run_id}/resolve-answers",
        json={
            "exception_id": exception_id,
            "answers": [
                {
                    "field_fingerprint": "fp_other_run_or_field",
                    "answer_text": "Must not be accepted",
                }
            ],
        },
    )
    assert wrong_field_resp.status_code == 400

    # User resolves the exact field and saves it for future runs.
    res_resp = await client.post(
        f"/api/v1/application-runs/{run_id}/resolve-answers",
        json={
            "exception_id": exception_id,
            "answers": [
                {
                    "field_fingerprint": "fp_hybrid_work",
                    "answer_text": "Yes, hybrid 2 days/week in office is fine",
                    "save_to_answer_bank": True,
                }
            ],
        },
    )
    assert res_resp.status_code == 200
    assert res_resp.json()["status"] == "queued"
    resolved_payload = res_resp.json()["exceptions"][0]["resolution_payload"]
    assert resolved_payload["owner_answers"][0]["answer_text"] == "[REDACTED]"
    assert "hybrid 2 days/week" not in res_resp.text

    replay_resp = await client.post(
        f"/api/v1/application-runs/{run_id}/resolve-answers",
        json={
            "exception_id": exception_id,
            "answers": [
                {
                    "field_fingerprint": "fp_hybrid_work",
                    "answer_text": "A replay must not replace the first answer",
                }
            ],
        },
    )
    assert replay_resp.status_code == 400

    # Verify answer was persisted in vault
    vault = ApplicantVaultRepository(session)
    answers = await vault.list_answers()
    saved = next((a for a in answers if "hybrid 2 days/week" in a.answer_text), None)
    assert saved is not None
    assert saved.question_intent == QuestionIntent.LOCATION_PREFERENCE

    # The newly saved reusable answer does not invalidate this run's frozen
    # snapshot. The exact per-run owner resolution is consumed instead.
    reclaim_resp = await client.post(
        "/api/v1/runner/claims",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Id": "runner_exc_reclaimed",
        },
        json={"run_id": run_id},
    )
    assert reclaim_resp.status_code == 200
    reclaimed_lease = reclaim_resp.json()["lease_token"]
    decision_resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": reclaimed_lease,
        },
        json={
            "observations": [
                {
                    "adapter_id": "greenhouse",
                    "page_id": "application-step-2",
                    "field_fingerprint": "fp_hybrid_work",
                    "label": "Are you willing to work in hybrid mode?",
                    "required": True,
                    "control_type": "text",
                    "options": [],
                    "validation_constraints": {
                        "min_length": 1,
                        "max_length": 200,
                        "pattern": None,
                    },
                }
            ]
        },
    )
    assert decision_resp.status_code == 200
    decision = decision_resp.json()["decisions"][0]
    assert decision["answer"] == "Yes, hybrid 2 days/week in office is fine"
    assert decision["reason_code"] == "owner_confirmed"
    assert decision["evidence"][0]["source"] == "owner_resolution"


async def test_cancel_run_flow(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    create_resp = await client.post(
        "/api/v1/application-runs",
        json=_full_auto_create_payload(group_id, resume_id),
    )
    run_id = create_resp.json()["created_runs"][0]["id"]

    # Cancel run
    cancel_resp = await client.post(
        f"/api/v1/application-runs/{run_id}/cancel",
        json={"reason": "Position closed by candidate preference"},
    )
    assert cancel_resp.status_code == 200
    assert cancel_resp.json()["status"] == "cancelled"
    assert (
        cancel_resp.json()["terminal_reason"]
        == "Position closed by candidate preference"
    )

    # Second cancel fails with 400
    cancel_again = await client.post(f"/api/v1/application-runs/{run_id}/cancel")
    assert cancel_again.status_code == 400


async def test_evidence_cleanup_service(session: AsyncSession, app: FastAPI) -> None:
    settings: Settings = app.state.settings
    group_id, resume_id, sha256 = await _setup_fixtures(session, settings)

    svc = ApplicationService(
        session_factory=app.state.session_factory, settings=settings
    )
    await svc.create_runs(
        ApplicationRunCreateRequest(
            job_group_ids=[group_id],
            resume_id=resume_id,
            automation_mode=AutomationMode.FULL_AUTO,
            owner_confirmation=FULL_AUTO_OWNER_CONFIRMATION,
        )
    )

    claim_res = await svc.claim_run(runner_id="runner_clean")
    assert claim_res is not None
    run, lease_token, _, _ = claim_res

    # Store evidence
    await svc.store_evidence(
        run_id=run.id,
        lease_token=lease_token,
        attempt=1,
        evidence_type=EvidenceType.SCREENSHOT,
        file_bytes=b"fake png image bytes",
        filename="screenshot.png",
        metadata_payload={"redaction_applied": True},
    )
    ev_dir = settings.resolved_evidence_root / f"runs/{run.id}"
    assert ev_dir.is_dir()

    # Complete run
    await svc.complete_run(
        run_id=run.id,
        lease_token=lease_token,
        terminal_status=ApplicationRunStatus.FAILED_FINAL,
        terminal_reason="Simulated failure for cleanup test",
    )

    # Run cleanup with 0 days retention
    cleaned = await svc.cleanup_expired_evidence(retention_days=0)
    assert cleaned >= 1
    assert not ev_dir.is_dir()
