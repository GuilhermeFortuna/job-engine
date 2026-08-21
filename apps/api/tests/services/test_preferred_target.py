"""Preferred application target selection (BACK-016)."""

from __future__ import annotations

from datetime import UTC, datetime
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4

from job_engine.db.repositories import LinkedSourcePosting
from job_engine.domain.enums import ApplicationTargetStatus
from job_engine.services.preferred_target import select_preferred_application_target


def _posting(*, listing_url: str, posting_id: UUID | None = None) -> Any:
    return SimpleNamespace(id=posting_id or uuid4(), listing_url=listing_url)


def _target(
    *,
    status: ApplicationTargetStatus,
    target_url: str,
    provider: str | None = "greenhouse",
    adapter: str | None = "greenhouse",
) -> Any:
    return SimpleNamespace(
        id=uuid4(),
        target_url=target_url,
        provider=provider,
        desktop_adapter_id=adapter,
        status=status,
        resolution_method="ats_native_listing",
        verified_at=datetime(2026, 8, 21, tzinfo=UTC),
    )


def test_prefers_executable_over_assisted_and_unresolved() -> None:
    early = datetime(2026, 8, 1, tzinfo=UTC)
    late = datetime(2026, 8, 2, tzinfo=UTC)
    assisted = LinkedSourcePosting(
        row=_posting(listing_url="https://himalayas.app/jobs/1"),
        linked_at=early,
        target=_target(
            status=ApplicationTargetStatus.ASSISTED,
            target_url="https://himalayas.app/jobs/1",
            provider=None,
            adapter=None,
        ),
    )
    executable = LinkedSourcePosting(
        row=_posting(listing_url="https://boards.greenhouse.io/acme/jobs/1"),
        linked_at=late,
        target=_target(
            status=ApplicationTargetStatus.EXECUTABLE,
            target_url="https://boards.greenhouse.io/acme/jobs/1",
        ),
    )
    unresolved = LinkedSourcePosting(
        row=_posting(listing_url="https://remoteok.com/l/1"),
        linked_at=early,
        target=None,
    )
    preferred = select_preferred_application_target((assisted, unresolved, executable))
    assert executable.target is not None
    assert preferred.status is ApplicationTargetStatus.EXECUTABLE
    assert preferred.id == executable.target.id
    assert preferred.target_url == executable.target.target_url


def test_tie_breaks_by_earliest_link_then_posting_id() -> None:
    linked_at = datetime(2026, 8, 1, tzinfo=UTC)
    lower_id = uuid4()
    higher_id = uuid4()
    while str(higher_id) < str(lower_id):
        higher_id = uuid4()
    first = LinkedSourcePosting(
        row=_posting(
            listing_url="https://boards.greenhouse.io/a/jobs/1",
            posting_id=higher_id,
        ),
        linked_at=linked_at,
        target=_target(
            status=ApplicationTargetStatus.EXECUTABLE,
            target_url="https://boards.greenhouse.io/a/jobs/1",
        ),
    )
    second = LinkedSourcePosting(
        row=_posting(
            listing_url="https://boards.greenhouse.io/b/jobs/2",
            posting_id=lower_id,
        ),
        linked_at=linked_at,
        target=_target(
            status=ApplicationTargetStatus.EXECUTABLE,
            target_url="https://boards.greenhouse.io/b/jobs/2",
        ),
    )
    preferred = select_preferred_application_target((first, second))
    assert preferred.source_posting_id == lower_id


def test_missing_targets_yield_unresolved_with_listing() -> None:
    link = LinkedSourcePosting(
        row=_posting(listing_url="https://jobicy.com/jobs/1"),
        linked_at=datetime(2026, 8, 1, tzinfo=UTC),
        target=None,
    )
    preferred = select_preferred_application_target((link,))
    assert preferred.status is ApplicationTargetStatus.UNRESOLVED
    assert preferred.id is None
    assert preferred.listing_url == "https://jobicy.com/jobs/1"
    assert preferred.assisted_reason is not None
