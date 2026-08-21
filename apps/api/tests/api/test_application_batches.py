"""API tests for durable application batches (BACK-017)."""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID

from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.application_targets import ApplicationTargetInput
from job_engine.config import Settings
from job_engine.db.repositories import ApplicantVaultRepository, CatalogRepository
from job_engine.domain.application_batches import BATCH_CONFIRMATION_REVISION
from job_engine.domain.applications import FULL_AUTO_OWNER_CONFIRMATION
from job_engine.domain.enums import (
    ApplicationTargetStatus,
    EmploymentType,
    JobStatus,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import SourcePostingInput
from tests.api.test_applications import _setup_fixtures


async def _add_second_executable_target(session: AsyncSession, group_id: UUID) -> UUID:
    cat_repo = CatalogRepository(session)
    now = datetime.now(UTC)
    posting = await cat_repo.upsert_source_posting(
        SourcePostingInput(
            source_id="greenhouse",
            source_posting_id="202",
            source_name="Greenhouse",
            listing_url="https://boards.greenhouse.io/acme/jobs/202",
            listing_url_canonical="https://boards.greenhouse.io/acme/jobs/202",
            title_original="Staff Backend Engineer",
            company_original="Stripe",
            description="Scale payments",
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
    await cat_repo.add_posting_to_group(group_id, posting.id)
    target = await cat_repo.upsert_application_target(
        ApplicationTargetInput(
            source_posting_id=posting.id,
            target_url="https://boards.greenhouse.io/acme/jobs/202",
            target_url_canonical="https://boards.greenhouse.io/acme/jobs/202",
            provider="greenhouse",
            desktop_adapter_id="greenhouse",
            status=ApplicationTargetStatus.EXECUTABLE,
            resolution_method="ats_native_listing",
            evidence={"test": True},
            verified_at=now,
        )
    )
    await session.commit()
    return target.id


async def test_batch_preview_authorize_list_cancel_and_atomicity(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, target_a, resume_id, _sha = await _setup_fixtures(session, settings)
    target_b = await _add_second_executable_target(session, group_id)

    vault = ApplicantVaultRepository(session)
    profile = await vault.get_active_profile()
    assert profile is not None
    resumes = await vault.list_resumes(profile.id)
    resume = next(r for r in resumes if r.resume_id == resume_id)

    preview_resp = await client.post(
        f"/api/v1/profiles/{profile.id}/application-batches/preview",
        json={
            "application_target_ids": [str(target_a), str(target_b)],
            "resume_id": resume_id,
            "applicant_profile_version": profile.version,
            "resume_version": resume.version,
        },
    )
    assert preview_resp.status_code == 200, preview_resp.text
    preview = preview_resp.json()
    assert preview["confirmation_revision"] == BATCH_CONFIRMATION_REVISION
    assert preview["issues"] == []
    assert len(preview["resolved_targets"]) == 2

    stale_resp = await client.post(
        f"/api/v1/profiles/{profile.id}/application-batches",
        json={
            "application_target_ids": [str(target_a), str(target_b)],
            "resume_id": resume_id,
            "applicant_profile_version": profile.version,
            "resume_version": resume.version,
            "automation_mode": "full_auto",
            "confirmation_revision": "stale-revision",
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
    )
    assert stale_resp.status_code == 422

    create_resp = await client.post(
        f"/api/v1/profiles/{profile.id}/application-batches",
        json={
            "application_target_ids": [str(target_a), str(target_b)],
            "resume_id": resume_id,
            "applicant_profile_version": profile.version,
            "resume_version": resume.version,
            "automation_mode": "full_auto",
            "confirmation_revision": BATCH_CONFIRMATION_REVISION,
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
    )
    assert create_resp.status_code == 201, create_resp.text
    batch = create_resp.json()
    assert batch["origin"] == "authorized"
    assert len(batch["items"]) == 2
    assert [item["position"] for item in batch["items"]] == [0, 1]
    assert batch["counters"]["queued"] == 2
    assert batch["items"][0]["run_id"] != batch["items"][1]["run_id"]
    assert batch["applicant_profile_version"] == profile.version
    assert batch["resume_asset_version"] == resume.version

    # One invalid target rejects the whole second batch (atomicity).
    bad_resp = await client.post(
        f"/api/v1/profiles/{profile.id}/application-batches",
        json={
            "application_target_ids": [
                str(target_a),
                "00000000-0000-4000-8000-000000000099",
            ],
            "resume_id": resume_id,
            "applicant_profile_version": profile.version,
            "resume_version": resume.version,
            "automation_mode": "full_auto",
            "confirmation_revision": BATCH_CONFIRMATION_REVISION,
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
    )
    assert bad_resp.status_code in {400, 409}, bad_resp.text

    list_resp = await client.get(f"/api/v1/profiles/{profile.id}/application-batches")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1

    detail_resp = await client.get(
        f"/api/v1/profiles/{profile.id}/application-batches/{batch['id']}"
    )
    assert detail_resp.status_code == 200
    assert detail_resp.json()["id"] == batch["id"]

    cancel_resp = await client.post(
        f"/api/v1/profiles/{profile.id}/application-batches/{batch['id']}/cancel",
        json={"reason": "owner cancelled batch"},
    )
    assert cancel_resp.status_code == 200, cancel_resp.text
    cancelled = cancel_resp.json()
    assert cancelled["counters"]["cancelled"] == 2
    assert cancelled["counters"]["queued"] == 0

    # Idempotent cancel
    cancel_again = await client.post(
        f"/api/v1/profiles/{profile.id}/application-batches/{batch['id']}/cancel",
        json={},
    )
    assert cancel_again.status_code == 200
    assert cancel_again.json()["counters"]["cancelled"] == 2


async def test_legacy_create_runs_attaches_batch_fields(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    _group_id, target_id, resume_id, _sha = await _setup_fixtures(session, settings)
    resp = await client.post(
        "/api/v1/application-runs",
        json={
            "application_target_ids": [str(target_id)],
            "resume_id": resume_id,
            "automation_mode": "full_auto",
            "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
        },
    )
    assert resp.status_code == 201, resp.text
    run = resp.json()["created_runs"][0]
    assert run["batch_id"]
    assert run["batch_item_id"]
    assert run["applicant_profile_id"]
