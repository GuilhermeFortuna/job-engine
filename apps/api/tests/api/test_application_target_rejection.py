"""Application-target create rejection paths (BACK-016)."""

from __future__ import annotations

import hashlib
from datetime import UTC, datetime
from typing import Literal
from uuid import UUID, uuid4

import pytest
from fastapi import FastAPI
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.application_targets import ApplicationTargetInput
from job_engine.config import Settings
from job_engine.db import models as orm
from job_engine.db.repositories import ApplicantVaultRepository, CatalogRepository
from job_engine.domain.applicant import (
    ApplicantProfileInput,
    ConfirmedField,
    FieldSource,
    PolicyCategory,
    ResumeAssetInput,
    ValueState,
)
from job_engine.domain.enums import (
    ApplicationTargetStatus,
    EmploymentType,
    JobStatus,
    RemoteStatus,
    Seniority,
)
from job_engine.domain.jobs import SourcePostingInput
from tests.factories import job_group_input

ProviderLiteral = Literal["greenhouse", "lever"]


async def _seed_profile_and_resume(session: AsyncSession, settings: Settings) -> None:
    vault = ApplicantVaultRepository(session)
    now = datetime.now(UTC)
    await vault.replace_profile(
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
    resume_root = settings.resolved_resume_root
    resume_root.mkdir(parents=True, exist_ok=True)
    pdf_path = resume_root / "test_resume.pdf"
    pdf_content = b"%PDF-1.4 test resume mock bytes"
    pdf_path.write_bytes(pdf_content)
    pdf_sha256 = hashlib.sha256(pdf_content).hexdigest()
    await vault.create_resume(
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


async def _seed_target(
    session: AsyncSession,
    *,
    target_url: str = "https://boards.greenhouse.io/acme/jobs/101",
    status: ApplicationTargetStatus = ApplicationTargetStatus.EXECUTABLE,
    provider: ProviderLiteral | None = "greenhouse",
    adapter: str | None = "greenhouse",
    posting_status: JobStatus = JobStatus.ACTIVE,
    group_status: JobStatus = JobStatus.ACTIVE,
    link_to_group: bool = True,
) -> UUID:
    now = datetime.now(UTC)
    catalog = CatalogRepository(session)
    group = await catalog.create_job_group(job_group_input(status=group_status))
    posting = await catalog.upsert_source_posting(
        SourcePostingInput(
            source_id="greenhouse",
            source_posting_id=str(uuid4()),
            source_name="Greenhouse",
            listing_url=target_url,
            listing_url_canonical=target_url,
            title_original="Engineer",
            company_original="Acme",
            description="Build",
            location_original="Remote",
            remote_status=RemoteStatus.REMOTE,
            employment_type=EmploymentType.FULL_TIME,
            seniority=Seniority.SENIOR,
            first_seen_at=now,
            last_seen_at=now,
            closed_at=None,
            status=posting_status,
        )
    )
    if link_to_group:
        await catalog.add_posting_to_group(group.id, posting.id)
    target = await catalog.upsert_application_target(
        ApplicationTargetInput(
            source_posting_id=posting.id,
            target_url=target_url,
            target_url_canonical=target_url,
            provider=provider,
            desktop_adapter_id=adapter,
            status=status,
            resolution_method="ats_native_listing",
            evidence={},
            verified_at=now,
        )
    )
    await session.commit()
    return target.id


def _create_payload(target_id: UUID) -> dict[str, object]:
    return {
        "application_target_ids": [str(target_id)],
        "automation_mode": "semi_auto_pause_before_submit",
    }


@pytest.mark.asyncio
async def test_create_rejects_forged_target_id(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _seed_profile_and_resume(session, settings)
    await session.commit()
    missing = uuid4()
    resp = await client.post(
        "/api/v1/application-runs",
        json=_create_payload(missing),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason_code"] == "TARGET_NOT_FOUND"


@pytest.mark.asyncio
async def test_create_rejects_non_executable_target(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _seed_profile_and_resume(session, settings)
    target_id = await _seed_target(session, status=ApplicationTargetStatus.UNRESOLVED)
    resp = await client.post(
        "/api/v1/application-runs",
        json=_create_payload(target_id),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason_code"] == "TARGET_NOT_EXECUTABLE"


@pytest.mark.asyncio
async def test_create_rejects_closed_posting(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _seed_profile_and_resume(session, settings)
    target_id = await _seed_target(session, posting_status=JobStatus.CLOSED)
    resp = await client.post(
        "/api/v1/application-runs",
        json=_create_payload(target_id),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason_code"] == "TARGET_POSTING_INACTIVE"


@pytest.mark.asyncio
async def test_create_rejects_lookalike_contract_mismatch(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _seed_profile_and_resume(session, settings)
    target_id = await _seed_target(
        session,
        target_url="https://evil.boards.greenhouse.io/acme/jobs/101",
    )
    resp = await client.post(
        "/api/v1/application-runs",
        json=_create_payload(target_id),
    )
    assert resp.status_code == 400
    body = resp.json()["detail"]
    assert body["reason_code"] in {
        "LOOKALIKE_HOST",
        "TARGET_CONTRACT_MISMATCH",
        "HOST_PATH_MISMATCH",
    }


@pytest.mark.asyncio
async def test_create_rejects_eu_lever_unbound(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _seed_profile_and_resume(session, settings)
    target_id = await _seed_target(
        session,
        target_url="https://jobs.eu.lever.co/acme/abcd/apply",
        provider="lever",
        adapter="lever",
    )
    resp = await client.post(
        "/api/v1/application-runs",
        json=_create_payload(target_id),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason_code"] in {
        "PROVIDER_REGION_UNBOUND",
        "TARGET_CONTRACT_MISMATCH",
    }


@pytest.mark.asyncio
async def test_create_rejects_unsupported_provider(
    client: AsyncClient, session: AsyncSession, app: FastAPI
) -> None:
    settings: Settings = app.state.settings
    await _seed_profile_and_resume(session, settings)
    target_id = await _seed_target(session)
    row = await session.get(orm.ApplicationTarget, target_id)
    assert row is not None
    row.provider = "workday"
    row.desktop_adapter_id = "workday"
    await session.commit()
    resp = await client.post(
        "/api/v1/application-runs",
        json=_create_payload(target_id),
    )
    assert resp.status_code == 400
    assert resp.json()["detail"]["reason_code"] == "TARGET_UNSUPPORTED_PROVIDER"
