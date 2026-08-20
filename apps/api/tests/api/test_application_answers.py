from __future__ import annotations

import hashlib
from datetime import UTC, datetime

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.config import Settings
from job_engine.db.repositories import ApplicantVaultRepository, CatalogRepository
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
from job_engine.domain.applications import FULL_AUTO_OWNER_CONFIRMATION
from job_engine.domain.enums import EmploymentType, JobStatus, RemoteStatus, Seniority
from job_engine.domain.jobs import Compensation, JobGroupInput, SourcePostingInput


async def _setup_fixtures(session: AsyncSession, settings: Settings) -> str:
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
            notice_period_days=ConfirmedField(
                value=30,
                source=FieldSource.OWNER,
                state=ValueState.PROVIDED,
                last_confirmed_at=now,
                policy_category=PolicyCategory.VERIFIED_PROFILE,
            ),
        ),
        expected_version=None,
    )

    await vault_repo.create_answer(
        ReusableAnswerInput(
            answer_id="ans_salary_exp",
            question_intent=QuestionIntent.COMPENSATION_EXPECTATION,
            jurisdiction=None,
            platform_scope=None,
            answer_text="$150,000 USD",
            policy_category=PolicyCategory.APPROVED_REUSABLE,
            provenance="owner_authored",
            last_confirmed_at=now,
        )
    )

    resume_root = settings.resolved_resume_root
    resume_root.mkdir(parents=True, exist_ok=True)
    pdf_path = resume_root / "answers_test_resume.pdf"
    pdf_content = b"%PDF-1.4 test resume mock bytes for answers"
    pdf_path.write_bytes(pdf_content)
    pdf_sha256 = hashlib.sha256(pdf_content).hexdigest()

    await vault_repo.create_resume(
        ResumeAssetInput(
            resume_id="res_answers_primary",
            label="Primary resume",
            source_markdown_path="answers_test_resume.md",
            upload_pdf_path="answers_test_resume.pdf",
            language="en",
            is_default=True,
        ),
        sha256=pdf_sha256,
    )

    cat_repo = CatalogRepository(session)
    group = await cat_repo.create_job_group(
        JobGroupInput(
            title="Senior Backend Engineer",
            title_original="Senior Backend Engineer",
            title_comparison_key="senior backend engineer",
            company="Acme",
            company_original="Acme",
            company_comparison_key="acme",
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
            published_at=now,
            first_seen_at=now,
            last_seen_at=now,
            closed_at=None,
            status=JobStatus.ACTIVE,
            location_eligibility_unknown=False,
            last_ingestion_run_id=None,
        )
    )
    posting = await cat_repo.upsert_source_posting(
        SourcePostingInput(
            source_id="acme_greenhouse",
            source_posting_id="202",
            source_name="Greenhouse",
            application_url="https://boards.greenhouse.io/acme/jobs/202?gh_jid=202",
            application_url_canonical="https://boards.greenhouse.io/acme/jobs/202",
            title_original="Senior Backend Engineer",
            company_original="Acme",
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
    return str(group.id)


async def _create_and_claim_run(
    client: AsyncClient, settings: Settings, group_id: str
) -> tuple[str, str]:
    create_resp = await client.post(
        "/api/v1/application-runs",
        json={
            "job_group_ids": [group_id],
            "resume_id": "res_answers_primary",
            "automation_mode": "full_auto",
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
    )
    assert create_resp.status_code == 201
    run_id = create_resp.json()["created_runs"][0]["id"]

    claim_resp = await client.post(
        "/api/v1/runner/claims",
        headers={"Authorization": f"Bearer {settings.runner_secret}"},
    )
    assert claim_resp.status_code == 200
    claim_data = claim_resp.json()
    assert claim_data["run"]["id"] == run_id
    return run_id, claim_data["lease_token"]


def _observation(
    fingerprint: str,
    label: str,
    control_type: str = "text",
    options: list[str] | None = None,
) -> dict[str, object]:
    return {
        "adapter_id": "greenhouse",
        "page_id": "page_1",
        "field_fingerprint": fingerprint,
        "label": label,
        "required": False,
        "control_type": control_type,
        "options": options or [],
    }


async def test_valid_claimed_run_returns_ordered_decisions(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": lease_token,
        },
        json={
            "observations": [
                _observation("fp_notice", "What is your notice period?"),
                _observation("fp_salary", "What is your desired salary?"),
            ]
        },
    )
    assert resp.status_code == 200
    decisions = resp.json()["decisions"]
    assert len(decisions) == 2
    assert decisions[0]["field_fingerprint"] == "fp_notice"
    assert decisions[0]["answer"] == "30"
    assert decisions[0]["reason_code"] == "exact_verified_profile"
    assert decisions[1]["field_fingerprint"] == "fp_salary"
    assert decisions[1]["answer"] == "$150,000 USD"
    assert decisions[1]["reason_code"] == "exact_approved_reusable"


async def test_missing_runner_secret_rejected(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={"X-Runner-Lease-Token": lease_token},
        json={"observations": [_observation("fp_1", "anything")]},
    )
    assert resp.status_code == 401


async def test_wrong_runner_secret_rejected(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": "Bearer wrong-secret",
            "X-Runner-Lease-Token": lease_token,
        },
        json={"observations": [_observation("fp_1", "anything")]},
    )
    assert resp.status_code == 401


async def test_missing_lease_token_rejected(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, _lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={"Authorization": f"Bearer {settings.runner_secret}"},
        json={"observations": [_observation("fp_1", "anything")]},
    )
    assert resp.status_code == 401


async def test_wrong_lease_token_rejected(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, _lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": "not-the-real-lease-token",
        },
        json={"observations": [_observation("fp_1", "anything")]},
    )
    assert resp.status_code == 401


async def test_cross_adapter_observation_abstains(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": lease_token,
        },
        json={
            "observations": [
                {
                    "adapter_id": "lever",
                    "page_id": "page_1",
                    "field_fingerprint": "fp_1",
                    "label": "What is your notice period?",
                    "required": False,
                    "control_type": "text",
                    "options": [],
                }
            ]
        },
    )
    assert resp.status_code == 200
    decisions = resp.json()["decisions"]
    assert decisions[0]["decision"] == "ABSTAIN"
    assert decisions[0]["reason_code"] == "stale_run_context"


async def test_stale_profile_snapshot_returns_conflict(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, lease_token = await _create_and_claim_run(client, settings, group_id)

    # Mutate the profile after the run was created/claimed to invalidate the
    # bound applicant_profile_version snapshot.
    vault_repo = ApplicantVaultRepository(session)
    now = datetime.now(UTC)
    await vault_repo.replace_profile(
        ApplicantProfileInput(
            first_name=ConfirmedField(
                value="Changed",
                source=FieldSource.OWNER,
                state=ValueState.PROVIDED,
                last_confirmed_at=now,
                policy_category=PolicyCategory.VERIFIED_PROFILE,
            ),
        ),
        expected_version=1,
    )
    await session.commit()

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": lease_token,
        },
        json={"observations": [_observation("fp_1", "anything")]},
    )
    assert resp.status_code == 409


async def test_duplicate_field_fingerprint_rejected(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id = await _setup_fixtures(session, settings)
    run_id, lease_token = await _create_and_claim_run(client, settings, group_id)

    resp = await client.post(
        f"/api/v1/runner/runs/{run_id}/answer-decisions",
        headers={
            "Authorization": f"Bearer {settings.runner_secret}",
            "X-Runner-Lease-Token": lease_token,
        },
        json={
            "observations": [
                _observation("fp_dup", "What is your notice period?"),
                _observation("fp_dup", "What is your notice period?"),
            ]
        },
    )
    assert resp.status_code == 400
