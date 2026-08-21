from datetime import UTC, datetime
from uuid import uuid4

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.domain.enums import JobStatus
from tests.factories import job_group_input, persist_job, source_posting_input


async def test_details_include_grouped_postings_and_omit_raw_payload(
    session: AsyncSession, client: AsyncClient
) -> None:
    group_id = await persist_job(
        session,
        group=job_group_input(title="Backend Engineer", description="Full text."),
        postings=[
            source_posting_input(
                source_id="himalayas",
                source_posting_id="d-h",
                listing_url="https://himalayas.example/jobs/d-h",
                listing_url_canonical="https://himalayas.example/jobs/d-h",
                raw_source_metadata={"secret": "nope"},
            ),
            source_posting_input(
                source_id="jobicy",
                source_posting_id="d-j",
                listing_url="https://jobicy.example/jobs/d-j",
                listing_url_canonical="https://jobicy.example/jobs/d-j",
            ),
        ],
    )
    response = await client.get(f"/api/v1/jobs/{group_id}")
    assert response.status_code == 200
    payload = response.json()
    assert payload["id"] == str(group_id)
    assert payload["description"] == "Full text."
    assert "description_excerpt" not in payload
    assert payload["preferred_application_target"]["listing_url"] == (
        "https://himalayas.example/jobs/d-h"
    )
    assert payload["preferred_application_target"]["status"] == "unresolved"
    postings = payload["source_postings"]
    assert [item["source_id"] for item in postings] == ["himalayas", "jobicy"]
    assert "linked_at" in postings[0]
    assert "raw_source_metadata" not in postings[0]
    assert "listing_url_canonical" not in postings[0]
    assert "ingestion_run_id" not in postings[0]
    assert "secret" not in response.text


async def test_details_description_strips_source_html(
    session: AsyncSession, client: AsyncClient
) -> None:
    group_id = await persist_job(
        session,
        group=job_group_input(
            title="HTML Details Role",
            description=(
                '<p>A <a href="https://fcamara.com.br/">FCamara</a> '
                "está em busca de um profissional.</p>"
            ),
        ),
    )
    response = await client.get(f"/api/v1/jobs/{group_id}")
    assert response.status_code == 200
    description = response.json()["description"]
    assert description == "A FCamara está em busca de um profissional."
    assert "<p>" not in description
    assert "<a " not in description


async def test_closed_group_is_fetchable_by_id(
    session: AsyncSession, client: AsyncClient
) -> None:
    group_id = await persist_job(
        session,
        group=job_group_input(
            title="Closed Role",
            status=JobStatus.CLOSED,
            closed_at=datetime.now(UTC),
        ),
        postings=[source_posting_input(status=JobStatus.CLOSED)],
    )
    listed = await client.get("/api/v1/jobs")
    assert str(group_id) not in [item["id"] for item in listed.json()["items"]]
    detail = await client.get(f"/api/v1/jobs/{group_id}")
    assert detail.status_code == 200
    assert detail.json()["status"] == "closed"


async def test_unknown_group_returns_404(client: AsyncClient) -> None:
    response = await client.get(f"/api/v1/jobs/{uuid4()}")
    assert response.status_code == 404
    assert response.json() == {"detail": "Job group not found"}


async def test_malformed_id_returns_422(client: AsyncClient) -> None:
    response = await client.get("/api/v1/jobs/not-a-uuid")
    assert response.status_code == 422
