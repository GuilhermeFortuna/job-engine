from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path
from uuid import UUID

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from job_engine.config import Settings
from job_engine.db.repositories import ApplicationRepository, ApplicationRunInput
from job_engine.domain.applications import (
    AutomationMode,
    calculate_answer_bank_hash,
)
from job_engine.main import create_app
from tests.api.test_applicant import _make_synthetic_pdf
from tests.db.conftest import alembic_config


def _make_png() -> bytes:
    return (
        b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
        b"\x08\x06\x00\x00\x00\x1f\x15c4\x00\x00\x00\nIDATx\x9cc\x00\x01\x00\x00\x05\x00\x01\r\n-\xb4\x00\x00\x00\x00IEND\xaeB`\x82"
    )


@pytest.fixture
async def profile_app(
    disposable_database_url: str, tmp_path: Path
) -> AsyncIterator[FastAPI]:
    command.upgrade(alembic_config(disposable_database_url), "head")
    data_dir = tmp_path / "data"
    data_dir.mkdir(parents=True, exist_ok=True)
    resumes_dir = tmp_path / "resumes"
    resumes_dir.mkdir(parents=True, exist_ok=True)
    settings = Settings(
        database_url=disposable_database_url,
        data_root=data_dir,
        resume_root=resumes_dir,
        runner_secret="test-runner-secret-at-least-thirty-two-characters",
    )
    application = create_app(settings)
    try:
        yield application
    finally:
        await application.state.engine.dispose()


@pytest.fixture
async def profile_client(profile_app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=profile_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Origin": "http://localhost:3000"},
    ) as http_client:
        yield http_client


@pytest.mark.asyncio
async def test_multi_profile_crud_and_switching(profile_client: AsyncClient) -> None:
    # 1. Create Profile A (Alice)
    res_a = await profile_client.post(
        "/api/v1/profiles",
        json={"display_name": "Alice Developer", "onboarding_step": "profile"},
    )
    assert res_a.status_code == 201
    profile_a = res_a.json()
    profile_a_id = profile_a["id"]

    # Profile A should automatically become active
    res_active = await profile_client.get("/api/v1/profiles/active")
    assert res_active.status_code == 200
    assert res_active.json()["id"] == profile_a_id

    # 2. Create Profile B (Bob)
    res_b = await profile_client.post(
        "/api/v1/profiles",
        json={"display_name": "Bob Designer", "onboarding_step": "profile"},
    )
    assert res_b.status_code == 201
    profile_b_id = res_b.json()["id"]

    # Alice is still active
    res_active2 = await profile_client.get("/api/v1/profiles/active")
    assert res_active2.json()["id"] == profile_a_id

    # 3. List profiles
    res_list = await profile_client.get("/api/v1/profiles")
    assert res_list.status_code == 200
    items = res_list.json()["items"]
    assert len(items) == 2
    item_map = {item["id"]: item for item in items}
    assert item_map[profile_a_id]["is_active"] is True
    assert item_map[profile_b_id]["is_active"] is False

    # 4. Switch active profile to Bob
    res_switch = await profile_client.put(
        "/api/v1/profiles/active",
        json={"profile_id": profile_b_id},
    )
    assert res_switch.status_code == 200
    assert res_switch.json()["active_profile_id"] == profile_b_id

    # Active profile is now Bob
    res_active3 = await profile_client.get("/api/v1/profiles/active")
    assert res_active3.json()["id"] == profile_b_id

    # 5. Update Profile B
    res_update = await profile_client.patch(
        f"/api/v1/profiles/{profile_b_id}",
        json={
            "expected_version": 1,
            "display_name": "Bob Senior Designer",
        },
    )
    assert res_update.status_code == 200
    assert res_update.json()["display_name"] == "Bob Senior Designer"
    assert res_update.json()["version"] == 2


@pytest.mark.asyncio
async def test_profile_archival_and_active_failover(
    profile_client: AsyncClient,
) -> None:
    # 1. Create Alice and Bob
    res_a = await profile_client.post(
        "/api/v1/profiles",
        json={"display_name": "Alice Developer"},
    )
    alice_id = res_a.json()["id"]

    res_b = await profile_client.post(
        "/api/v1/profiles",
        json={"display_name": "Bob Designer"},
    )
    bob_id = res_b.json()["id"]

    # Switch active to Bob
    await profile_client.put("/api/v1/profiles/active", json={"profile_id": bob_id})

    # 2. Archive Bob (active profile)
    res_arch = await profile_client.post(
        f"/api/v1/profiles/{bob_id}/archive",
        json={"expected_version": 1},
    )
    assert res_arch.status_code == 200
    assert res_arch.json()["archived_at"] is not None

    # 3. Failover: Active profile automatically switches to Alice
    res_active = await profile_client.get("/api/v1/profiles/active")
    assert res_active.status_code == 200
    assert res_active.json()["id"] == alice_id

    # 4. Cannot set archived Bob as active
    res_bad_active = await profile_client.put(
        "/api/v1/profiles/active",
        json={"profile_id": bob_id},
    )
    assert res_bad_active.status_code in {400, 422}


@pytest.mark.asyncio
async def test_cross_profile_isolation(profile_client: AsyncClient) -> None:
    # Create Profile A & B
    res_a = await profile_client.post(
        "/api/v1/profiles", json={"display_name": "Alice"}
    )
    a_id = res_a.json()["id"]
    res_b = await profile_client.post("/api/v1/profiles", json={"display_name": "Bob"})
    b_id = res_b.json()["id"]

    # 1. Add answer under Profile A
    now_iso = datetime.now(UTC).isoformat()
    ans_a_res = await profile_client.post(
        f"/api/v1/profiles/{a_id}/answer-bank",
        json={
            "answer_id": "ans_auth_a",
            "question_intent": "work_authorization",
            "answer_text": "Authorized in US",
            "policy_category": "approved_reusable",
            "last_confirmed_at": now_iso,
        },
    )
    assert ans_a_res.status_code == 201

    # 2. Add answer under Profile B
    ans_b_res = await profile_client.post(
        f"/api/v1/profiles/{b_id}/answer-bank",
        json={
            "answer_id": "ans_auth_b",
            "question_intent": "work_authorization",
            "answer_text": "Authorized in UK",
            "policy_category": "approved_reusable",
            "last_confirmed_at": now_iso,
        },
    )
    assert ans_b_res.status_code == 201

    # 3. Profile B cannot see Profile A's answer
    get_cross = await profile_client.get(
        f"/api/v1/profiles/{b_id}/answer-bank/ans_auth_a"
    )
    assert get_cross.status_code == 404

    # 4. Profile A cannot delete Profile B's answer
    del_cross = await profile_client.delete(
        f"/api/v1/profiles/{a_id}/answer-bank/ans_auth_b?expected_version=1"
    )
    assert del_cross.status_code == 404


@pytest.mark.asyncio
async def test_profile_archive_guard_with_active_runs(
    profile_app: FastAPI, profile_client: AsyncClient, tmp_path: Path
) -> None:
    # 1. Create Profile
    res_a = await profile_client.post(
        "/api/v1/profiles", json={"display_name": "Alice"}
    )
    a_id = UUID(res_a.json()["id"])

    # 2. Upload document as resume asset
    pdf_bytes = _make_synthetic_pdf("Active Run Candidate Resume")
    files = {"file": ("active_resume.pdf", pdf_bytes, "application/pdf")}
    doc_res = await profile_client.post(
        f"/api/v1/profiles/{a_id}/documents",
        files=files,
    )
    assert doc_res.status_code == 201
    doc_id = doc_res.json()["id"]

    # Register resume referencing managed asset
    res_res = await profile_client.post(
        f"/api/v1/profiles/{a_id}/resumes",
        json={
            "resume_id": "res_active",
            "label": "Active Resume",
            "language": "en",
            "managed_asset_id": doc_id,
        },
    )
    assert res_res.status_code == 201
    resume_db_id = UUID(res_res.json()["id"])

    # 3. Create active application run in database
    async with profile_app.state.session_factory() as session:
        from job_engine.db.repositories import CatalogRepository
        from job_engine.domain.enums import (
            EmploymentType,
            JobStatus,
            RemoteStatus,
            Seniority,
        )
        from job_engine.domain.jobs import (
            Compensation,
            JobGroupInput,
        )

        group = await CatalogRepository(session).create_job_group(
            JobGroupInput(
                title="Engineer Active",
                title_original="Engineer Active",
                title_comparison_key="engineer active",
                company="Acme Active",
                company_original="Acme Active",
                company_comparison_key="acme active",
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
        repo = ApplicationRepository(session)
        await repo.create_run(
            ApplicationRunInput(
                applicant_profile_id=a_id,
                job_group_id=group.id,
                source_posting_id=None,
                canonical_application_url="https://example.com/jobs/1",
                application_url="https://example.com/jobs/1",
                platform_adapter_id="generic",
                resume_asset_id=resume_db_id,
                resume_sha256="a" * 64,
                applicant_profile_version=1,
                answer_bank_snapshot={},
                answer_bank_hash=calculate_answer_bank_hash({}),
                automation_mode=AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT,
                idempotency_key="active_run_test_key".ljust(64, "0"),
            )
        )
        await session.commit()

    # 4. Attempt to archive Profile A -> rejected with 409 Conflict
    arch_res = await profile_client.post(
        f"/api/v1/profiles/{a_id}/archive",
        json={"expected_version": 1},
    )
    assert arch_res.status_code == 409
    assert "active" in arch_res.json()["detail"].lower()


@pytest.mark.asyncio
async def test_avatar_upload_crop_and_delete(profile_client: AsyncClient) -> None:
    res_prof = await profile_client.post(
        "/api/v1/profiles", json={"display_name": "Alice"}
    )
    profile_id = res_prof.json()["id"]

    # 1. Upload Avatar
    png_bytes = _make_png()
    files = {"file": ("avatar.png", png_bytes, "image/png")}
    upload_res = await profile_client.post(
        f"/api/v1/profiles/{profile_id}/avatar",
        files=files,
    )
    assert upload_res.status_code == 200
    avatar_data = upload_res.json()
    assert avatar_data["asset"]["id"] is not None

    # 2. Update Crop (normalized 0.0 - 1.0)
    crop_res = await profile_client.post(
        f"/api/v1/profiles/{profile_id}/avatar/crop",
        json={"x": 0.1, "y": 0.2, "width": 0.5, "height": 0.5},
    )
    assert crop_res.status_code == 200
    assert crop_res.json()["asset"]["crop_coordinates"] == {
        "x": 0.1,
        "y": 0.2,
        "width": 0.5,
        "height": 0.5,
    }

    # 3. Delete Avatar
    del_res = await profile_client.delete(f"/api/v1/profiles/{profile_id}/avatar")
    assert del_res.status_code == 204

    # Profile reflects removed avatar
    prof_after = (await profile_client.get(f"/api/v1/profiles/{profile_id}")).json()
    assert prof_after["avatar_asset_id"] is None


@pytest.mark.asyncio
async def test_document_and_binary_streaming(profile_client: AsyncClient) -> None:
    res_prof = await profile_client.post(
        "/api/v1/profiles", json={"display_name": "Alice"}
    )
    profile_id = res_prof.json()["id"]

    # 1. Upload Document
    pdf_bytes = _make_synthetic_pdf("Synthetic Candidate Resume Text Layer")
    files = {"file": ("cloud_resume.pdf", pdf_bytes, "application/pdf")}
    upload_res = await profile_client.post(
        f"/api/v1/profiles/{profile_id}/documents",
        files=files,
    )
    assert upload_res.status_code == 201
    doc = upload_res.json()
    asset_id = doc["id"]
    assert doc["file_name"] == "cloud_resume.pdf"
    assert doc["content_type"] == "application/pdf"
    assert "Synthetic Candidate Resume Text Layer" in (doc["extracted_text"] or "")

    # 2. List Documents
    list_res = await profile_client.get(f"/api/v1/profiles/{profile_id}/documents")
    assert list_res.status_code == 200
    assert len(list_res.json()["items"]) == 1

    # 3. Full Content Streaming (200 OK)
    content_res = await profile_client.get(
        f"/api/v1/profiles/{profile_id}/assets/{asset_id}/content"
    )
    assert content_res.status_code == 200
    assert content_res.content == pdf_bytes
    etag = content_res.headers.get("ETag")
    assert etag is not None

    # 4. ETag 304 Not Modified
    cached_res = await profile_client.get(
        f"/api/v1/profiles/{profile_id}/assets/{asset_id}/content",
        headers={"If-None-Match": etag},
    )
    assert cached_res.status_code == 304

    # 5. Range Request (206 Partial Content)
    range_res = await profile_client.get(
        f"/api/v1/profiles/{profile_id}/assets/{asset_id}/content",
        headers={"Range": "bytes=0-15"},
    )
    assert range_res.status_code == 206
    assert range_res.content == pdf_bytes[:16]
    assert range_res.headers.get("Content-Range") == f"bytes 0-15/{len(pdf_bytes)}"

    # 6. Delete Document
    del_res = await profile_client.delete(
        f"/api/v1/profiles/{profile_id}/documents/{asset_id}"
    )
    assert del_res.status_code == 204

    # Verify 404 after deletion
    post_del = await profile_client.get(
        f"/api/v1/profiles/{profile_id}/assets/{asset_id}/content"
    )
    assert post_del.status_code == 404
