from collections.abc import AsyncIterator
from datetime import UTC, datetime
from pathlib import Path

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from job_engine.config import Settings
from job_engine.main import create_app
from tests.db.conftest import alembic_config


def _make_synthetic_pdf(text: str = "Synthetic Candidate Resume Text Layer") -> bytes:
    content = f"BT /F1 12 Tf 72 712 Td ({text}) Tj ET".encode("latin-1")
    stream_len = len(content)
    pdf = f"""%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<<
  /Type /Page
  /Parent 2 0 R
  /MediaBox [0 0 612 792]
  /Contents 4 0 R
  /Resources << /Font << /F1 5 0 R >> >>
>>
endobj
4 0 obj
<< /Length {stream_len} >>
stream
BT /F1 12 Tf 72 712 Td ({text}) Tj ET
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
0000000300 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
365
%%EOF
""".encode("latin-1")
    return pdf


@pytest.fixture
async def applicant_app(
    disposable_database_url: str, tmp_path: Path
) -> AsyncIterator[FastAPI]:
    command.upgrade(alembic_config(disposable_database_url), "head")
    settings = Settings(
        database_url=disposable_database_url,
        resume_root=tmp_path,
        runner_secret="test-runner-secret-at-least-thirty-two-characters",
    )
    application = create_app(settings)
    try:
        yield application
    finally:
        await application.state.engine.dispose()


@pytest.fixture
async def applicant_client(applicant_app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=applicant_app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Origin": "http://localhost:3000"},
    ) as http_client:
        yield http_client


async def test_applicant_profile_crud_and_optimistic_locking(
    applicant_client: AsyncClient,
) -> None:
    # 1. Profile not found initially
    get_res = await applicant_client.get("/api/v1/applicant-profile")
    assert get_res.status_code == 404

    now_iso = datetime.now(UTC).isoformat()

    # 2. Create profile with expected_version=None
    create_payload = {
        "expected_version": None,
        "first_name": {
            "state": "provided",
            "value": "Jane",
            "source": "owner",
            "last_confirmed_at": now_iso,
            "policy_category": "verified_profile",
        },
        "last_name": {
            "state": "provided",
            "value": "Doe",
            "source": "owner",
            "last_confirmed_at": now_iso,
            "policy_category": "verified_profile",
        },
        "email": {
            "state": "provided",
            "value": "jane@example.com",
            "source": "owner",
            "last_confirmed_at": now_iso,
            "policy_category": "verified_profile",
        },
    }

    put_res = await applicant_client.put(
        "/api/v1/applicant-profile", json=create_payload
    )
    assert put_res.status_code == 200
    profile_data = put_res.json()
    assert profile_data["version"] == 1
    assert profile_data["first_name"]["value"] == "Jane"
    assert profile_data["email"]["value"] == "jane@example.com"

    # 3. GET profile
    get_res2 = await applicant_client.get("/api/v1/applicant-profile")
    assert get_res2.status_code == 200
    assert get_res2.json()["version"] == 1

    # 4. Conflict when trying to update with stale version
    stale_payload = {
        "expected_version": 999,
        "first_name": {
            "state": "provided",
            "value": "Janet",
            "source": "owner",
            "last_confirmed_at": now_iso,
            "policy_category": "verified_profile",
        },
    }
    conflict_res = await applicant_client.put(
        "/api/v1/applicant-profile", json=stale_payload
    )
    assert conflict_res.status_code == 409

    # 5. Successful update with expected_version=1 -> increments to 2
    update_payload = {
        "expected_version": 1,
        "first_name": {
            "state": "provided",
            "value": "Janet",
            "source": "owner",
            "last_confirmed_at": now_iso,
            "policy_category": "verified_profile",
        },
        "email": {
            "state": "provided",
            "value": "janet@example.com",
            "source": "owner",
            "last_confirmed_at": now_iso,
            "policy_category": "verified_profile",
        },
    }
    put_res2 = await applicant_client.put(
        "/api/v1/applicant-profile", json=update_payload
    )
    assert put_res2.status_code == 200
    assert put_res2.json()["version"] == 2
    assert put_res2.json()["first_name"]["value"] == "Janet"


async def test_resume_import_preview_endpoint(
    applicant_client: AsyncClient, tmp_path: Path
) -> None:
    md_file = tmp_path / "test_resume.md"
    md_file.write_text(
        """# ROBIN HOOD
**Software Architect**  
Nottingham, UK • robin@example.com • [robin.dev](https://robin.dev)

---

## TECHNICAL SKILLS
- **Languages:** Python, Rust, Go
""",
        encoding="utf-8",
    )

    # 1. Invalid path escapes
    bad_res = await applicant_client.post(
        "/api/v1/applicant-profile/import-resume",
        json={"source_markdown_path": "../outside.md"},
    )
    assert bad_res.status_code == 422

    # 2. Valid import proposal
    good_res = await applicant_client.post(
        "/api/v1/applicant-profile/import-resume",
        json={"source_markdown_path": "test_resume.md"},
    )
    assert good_res.status_code == 200
    proposal = good_res.json()
    assert proposal["source_markdown_path"] == "test_resume.md"
    diff_map = {d["field_path"]: d for d in proposal["diffs"]}
    assert diff_map["first_name"]["proposed_value"] == "ROBIN"
    assert diff_map["email"]["proposed_value"] == "robin@example.com"

    # 3. Assert profile was NOT mutated in database
    prof_res = await applicant_client.get("/api/v1/applicant-profile")
    assert prof_res.status_code == 404


async def test_resume_catalog_endpoints(
    applicant_client: AsyncClient, tmp_path: Path
) -> None:
    # Prepare synthetic files
    md1 = tmp_path / "resume1.md"
    md1.write_text("# Candidate 1", encoding="utf-8")
    pdf1 = tmp_path / "resume1.pdf"
    pdf1.write_bytes(_make_synthetic_pdf("Resume One Content"))

    md2 = tmp_path / "resume2.md"
    md2.write_text("# Candidate 2", encoding="utf-8")
    pdf2 = tmp_path / "resume2.pdf"
    pdf2.write_bytes(_make_synthetic_pdf("Resume Two Content"))

    # 1. List resumes empty
    list_res = await applicant_client.get("/api/v1/resumes")
    assert list_res.status_code == 200
    assert list_res.json()["items"] == []

    # 2. Register first resume (automatically becomes default)
    create_res1 = await applicant_client.post(
        "/api/v1/resumes",
        json={
            "resume_id": "res_first",
            "label": "First Resume",
            "source_markdown_path": "resume1.md",
            "upload_pdf_path": "resume1.pdf",
            "language": "en",
            "is_default": False,
        },
    )
    assert create_res1.status_code == 201
    r1 = create_res1.json()
    assert r1["resume_id"] == "res_first"
    assert r1["is_default"] is True  # first becomes default
    assert r1["version"] == 1
    assert len(r1["sha256"]) == 64
    assert not r1["upload_pdf_path"].startswith("/")

    # 3. Register second resume as default (toggles first to non-default)
    create_res2 = await applicant_client.post(
        "/api/v1/resumes",
        json={
            "resume_id": "res_second",
            "label": "Second Resume",
            "source_markdown_path": "resume2.md",
            "upload_pdf_path": "resume2.pdf",
            "language": "en",
            "is_default": True,
        },
    )
    assert create_res2.status_code == 201
    r2 = create_res2.json()
    assert r2["is_default"] is True

    # Check that res_first is now is_default=False
    list_res2 = await applicant_client.get("/api/v1/resumes")
    items = {item["resume_id"]: item for item in list_res2.json()["items"]}
    assert items["res_second"]["is_default"] is True
    assert items["res_first"]["is_default"] is False

    # 4. Patch res_first (refresh checksum and update label)
    patch_res = await applicant_client.patch(
        "/api/v1/resumes/res_first",
        json={
            "expected_version": 1,
            "label": "First Resume Updated",
            "refresh_checksum": True,
        },
    )
    assert patch_res.status_code == 200
    assert patch_res.json()["label"] == "First Resume Updated"
    assert patch_res.json()["version"] == 2

    # 5. Try deleting default resume while another exists -> 409
    del_default_res = await applicant_client.delete(
        "/api/v1/resumes/res_second?expected_version=1"
    )
    assert del_default_res.status_code == 409

    # 6. Delete non-default resume -> 204
    del_non_default = await applicant_client.delete(
        "/api/v1/resumes/res_first?expected_version=2"
    )
    assert del_non_default.status_code == 204

    # 7. Now deleting the only remaining resume succeeds -> 204
    del_last = await applicant_client.delete(
        "/api/v1/resumes/res_second?expected_version=1"
    )
    assert del_last.status_code == 204


async def test_answer_bank_endpoints(applicant_client: AsyncClient) -> None:
    now_iso = datetime.now(UTC).isoformat()

    # 1. List initially empty
    res = await applicant_client.get("/api/v1/answer-bank")
    assert res.status_code == 200
    assert res.json()["items"] == []

    # 2. Create reusable answer
    ans_payload = {
        "answer_id": "ans_auth_br",
        "question_intent": "work_authorization",
        "jurisdiction": "BR",
        "platform_scope": "greenhouse",
        "answer_text": "Authorized to work in Brazil (Citizen)",
        "policy_category": "approved_reusable",
        "provenance": "owner_authored",
        "last_confirmed_at": now_iso,
    }
    create_res = await applicant_client.post("/api/v1/answer-bank", json=ans_payload)
    assert create_res.status_code == 201
    ans_data = create_res.json()
    assert ans_data["answer_id"] == "ans_auth_br"
    assert ans_data["version"] == 1

    # 3. Filter list by intent
    list_res = await applicant_client.get(
        "/api/v1/answer-bank?question_intent=work_authorization"
    )
    assert list_res.status_code == 200
    assert len(list_res.json()["items"]) == 1

    # 4. Update answer with optimistic version
    update_payload = {
        "expected_version": 1,
        "question_intent": "work_authorization",
        "jurisdiction": "BR",
        "platform_scope": None,
        "answer_text": "Authorized to work in Brazil (Updated)",
        "policy_category": "approved_reusable",
        "provenance": "owner_authored",
        "last_confirmed_at": now_iso,
    }
    update_res = await applicant_client.put(
        "/api/v1/answer-bank/ans_auth_br", json=update_payload
    )
    assert update_res.status_code == 200
    assert update_res.json()["version"] == 2
    assert "Updated" in update_res.json()["answer_text"]

    # 5. Stale version returns 409
    update_payload["expected_version"] = 1
    conflict_res = await applicant_client.put(
        "/api/v1/answer-bank/ans_auth_br", json=update_payload
    )
    assert conflict_res.status_code == 409

    # 6. Delete answer -> 204
    del_res = await applicant_client.delete(
        "/api/v1/answer-bank/ans_auth_br?expected_version=2"
    )
    assert del_res.status_code == 204
