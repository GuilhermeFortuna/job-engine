"""Application target sync during ingestion (BACK-016)."""

from __future__ import annotations

from datetime import UTC, datetime

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import ApplicationTargetStatus, JobStatus
from job_engine.services.application_targets import sync_application_target_for_posting
from tests.factories import source_posting_input


@pytest.mark.asyncio
async def test_aggregator_listing_does_not_create_target(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    posting = await repo.upsert_source_posting(
        source_posting_input(
            source_id="himalayas",
            listing_url="https://himalayas.app/jobs/abc",
            listing_url_canonical="https://himalayas.app/jobs/abc",
        )
    )
    await sync_application_target_for_posting(repo, posting)
    assert await repo.get_application_target_by_source_posting(posting.id) is None


@pytest.mark.asyncio
async def test_ats_native_creates_executable_target(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    url = "https://boards.greenhouse.io/khanacademy/jobs/12345"
    posting = await repo.upsert_source_posting(
        source_posting_input(
            source_id="greenhouse",
            source_posting_id="khanacademy:12345",
            listing_url=url,
            listing_url_canonical=url,
        )
    )
    await sync_application_target_for_posting(repo, posting)
    target = await repo.get_application_target_by_source_posting(posting.id)
    assert target is not None
    assert target.status is ApplicationTargetStatus.EXECUTABLE
    assert target.provider == "greenhouse"
    assert target.desktop_adapter_id == "greenhouse"
    assert target.target_url == url


@pytest.mark.asyncio
async def test_closed_posting_downgrades_existing_target(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    url = "https://jobs.lever.co/ro/abcd-efgh/apply"
    posting = await repo.upsert_source_posting(
        source_posting_input(
            source_id="lever",
            source_posting_id="ro:abcd-efgh",
            listing_url=url,
            listing_url_canonical=url,
        )
    )
    await sync_application_target_for_posting(repo, posting)
    target = await repo.get_application_target_by_source_posting(posting.id)
    assert target is not None
    assert target.status is ApplicationTargetStatus.EXECUTABLE

    closed = await repo.upsert_source_posting(
        source_posting_input(
            source_id="lever",
            source_posting_id="ro:abcd-efgh",
            listing_url=url,
            listing_url_canonical=url,
            status=JobStatus.CLOSED,
            closed_at=datetime.now(UTC),
        )
    )
    await sync_application_target_for_posting(repo, closed)
    downgraded = await repo.get_application_target_by_source_posting(posting.id)
    assert downgraded is not None
    assert downgraded.status is ApplicationTargetStatus.UNRESOLVED
    assert "invalidated_reason" in downgraded.evidence
