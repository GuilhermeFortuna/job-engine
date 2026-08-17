from datetime import UTC, datetime
from uuid import UUID

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.models import IngestionRun
from job_engine.domain.enums import IngestionRunStatus, JobStatus
from job_engine.domain.taxonomy import REQUIRED_ROLE_FAMILY_IDS
from tests.factories import job_group_input, persist_job, source_posting_input


async def test_filters_vocabulary_and_labels(client: AsyncClient) -> None:
    response = await client.get("/api/v1/catalog/filters")
    assert response.status_code == 200
    payload = response.json()
    assert [item["id"] for item in payload["role_families"]] == list(
        REQUIRED_ROLE_FAMILY_IDS
    )
    assert payload["role_families"][0] == {
        "id": "software_developer",
        "label": "Software developer",
    }
    assert payload["technologies"][0] == {"value": "Python", "label": "Python"}
    assert payload["remote_status"][0] == {"value": "remote", "label": "Remote"}
    assert [item["value"] for item in payload["location_eligibility"]] == [
        "brazil",
        "latin_america",
        "worldwide",
        "unknown",
    ]
    assert payload["posted_within"][-1] == {"value": "any", "label": "Any time"}
    assert payload["sort"] == [
        {"value": "newest", "label": "Newest"},
        {"value": "compensation_desc", "label": "Compensation (high to low)"},
    ]
    assert payload["sources"] == [
        {"id": "himalayas", "label": "Himalayas"},
        {"id": "jobicy", "label": "Jobicy"},
        {"id": "remoteok", "label": "Remote OK"},
    ]


async def test_health_never_run_uses_nulls(client: AsyncClient) -> None:
    response = await client.get("/api/v1/catalog/health")
    assert response.status_code == 200
    payload = response.json()
    assert payload["catalog_last_seen_at"] is None
    assert payload["sources"] == [
        {
            "source_id": "himalayas",
            "latest_run_status": "never_run",
            "latest_run_started_at": None,
            "latest_run_completed_at": None,
            "fetched_count": None,
            "accepted_count": None,
            "rejected_count": None,
        },
        {
            "source_id": "jobicy",
            "latest_run_status": "never_run",
            "latest_run_started_at": None,
            "latest_run_completed_at": None,
            "fetched_count": None,
            "accepted_count": None,
            "rejected_count": None,
        },
        {
            "source_id": "remoteok",
            "latest_run_status": "never_run",
            "latest_run_started_at": None,
            "latest_run_completed_at": None,
            "fetched_count": None,
            "accepted_count": None,
            "rejected_count": None,
        },
    ]


async def test_partial_failure_keeps_failed_source_jobs_searchable(
    session: AsyncSession, client: AsyncClient
) -> None:
    started = datetime(2026, 8, 16, 12, 0, tzinfo=UTC)
    session.add(
        IngestionRun(
            source_id="himalayas",
            status=IngestionRunStatus.FAILURE,
            started_at=started,
            completed_at=started,
            fetched_count=0,
            accepted_count=0,
            rejected_count=0,
            error_summaries=[{"code": "upstream", "message": "secret token xyz"}],
        )
    )
    session.add(
        IngestionRun(
            source_id="jobicy",
            status=IngestionRunStatus.SUCCESS,
            started_at=started,
            completed_at=started,
            fetched_count=4,
            accepted_count=4,
            rejected_count=0,
        )
    )
    await session.commit()
    himalayas_job = await persist_job(
        session,
        group=job_group_input(title="Himalayas Persisted", status=JobStatus.ACTIVE),
        postings=[
            source_posting_input(source_id="himalayas", source_posting_id="hf-1")
        ],
    )
    jobicy_job = await persist_job(
        session,
        group=job_group_input(title="Jobicy Persisted", status=JobStatus.ACTIVE),
        postings=[source_posting_input(source_id="jobicy", source_posting_id="jf-1")],
    )

    search = await client.get("/api/v1/jobs")
    found = {item["id"] for item in search.json()["items"]}
    assert str(himalayas_job) in found
    assert str(jobicy_job) in found

    health = await client.get("/api/v1/catalog/health")
    payload = health.json()
    assert payload["sources"][0]["source_id"] == "himalayas"
    assert payload["sources"][0]["latest_run_status"] == "failure"
    assert payload["sources"][0]["fetched_count"] == 0
    assert payload["sources"][1]["latest_run_status"] == "success"
    assert "secret" not in health.text
    assert "error_summaries" not in health.text
    assert payload["catalog_last_seen_at"] is not None


async def test_latest_run_tie_uses_id_asc(
    session: AsyncSession, client: AsyncClient
) -> None:
    started = datetime(2026, 8, 16, 12, 0, tzinfo=UTC)
    low = UUID("00000000-0000-4000-8000-000000000001")
    high = UUID("00000000-0000-4000-8000-000000000002")
    session.add(
        IngestionRun(
            id=high,
            source_id="himalayas",
            status=IngestionRunStatus.FAILURE,
            started_at=started,
            completed_at=started,
            fetched_count=1,
        )
    )
    session.add(
        IngestionRun(
            id=low,
            source_id="himalayas",
            status=IngestionRunStatus.SUCCESS,
            started_at=started,
            completed_at=started,
            fetched_count=9,
        )
    )
    await session.commit()
    health = await client.get("/api/v1/catalog/health")
    himalayas = health.json()["sources"][0]
    assert himalayas["latest_run_status"] == "success"
    assert himalayas["fetched_count"] == 9
