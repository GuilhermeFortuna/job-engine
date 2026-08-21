"""Concurrency coverage for advisory-locked batch authorization (BACK-017).

Requires Postgres. Skipped automatically when the disposable DB fixture cannot
connect.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime
from uuid import UUID

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
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

pytestmark = pytest.mark.asyncio


async def _second_target(session: AsyncSession, group_id: UUID) -> UUID:
    cat_repo = CatalogRepository(session)
    now = datetime.now(UTC)
    posting = await cat_repo.upsert_source_posting(
        SourcePostingInput(
            source_id="greenhouse",
            source_posting_id="303",
            source_name="Greenhouse",
            listing_url="https://boards.greenhouse.io/acme/jobs/303",
            listing_url_canonical="https://boards.greenhouse.io/acme/jobs/303",
            title_original="Principal Engineer",
            company_original="Stripe",
            description="Lead systems",
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
            target_url="https://boards.greenhouse.io/acme/jobs/303",
            target_url_canonical="https://boards.greenhouse.io/acme/jobs/303",
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


async def test_overlapping_batch_creates_are_serialized(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    group_id, target_a, resume_id, _sha = await _setup_fixtures(session, settings)
    target_b = await _second_target(session, group_id)
    vault = ApplicantVaultRepository(session)
    profile = await vault.get_active_profile()
    assert profile is not None
    resumes = await vault.list_resumes(profile.id)
    resume = next(r for r in resumes if r.resume_id == resume_id)

    payload = {
        "application_target_ids": [str(target_a), str(target_b)],
        "resume_id": resume_id,
        "applicant_profile_version": profile.version,
        "resume_version": resume.version,
        "automation_mode": "full_auto",
        "confirmation_revision": BATCH_CONFIRMATION_REVISION,
        "owner_confirmation": FULL_AUTO_OWNER_CONFIRMATION,
    }

    transport = ASGITransport(app=app)
    headers = {"Origin": "http://localhost:3000"}
    async with AsyncClient(
        transport=transport, base_url="http://test", headers=headers
    ) as c1:
        async with AsyncClient(
            transport=transport, base_url="http://test", headers=headers
        ) as c2:
            results = await asyncio.gather(
                c1.post(
                    f"/api/v1/profiles/{profile.id}/application-batches",
                    json=payload,
                ),
                c2.post(
                    f"/api/v1/profiles/{profile.id}/application-batches",
                    json=payload,
                ),
                return_exceptions=True,
            )

    statuses = sorted(
        response.status_code
        for response in results
        if not isinstance(response, BaseException)
    )
    assert 201 in statuses
    assert statuses.count(201) == 1
    assert any(code in {400, 409} for code in statuses if code != 201)

    list_resp = await client.get(f"/api/v1/profiles/{profile.id}/application-batches")
    assert list_resp.status_code == 200
    assert list_resp.json()["total"] == 1
