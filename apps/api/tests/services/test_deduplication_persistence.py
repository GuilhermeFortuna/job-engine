from datetime import UTC, datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.db.models import JobGroup as JobGroupRow
from job_engine.db.models import SourcePosting as SourcePostingRow
from job_engine.db.repositories import CatalogRepository
from job_engine.services.deduplication import DedupKind, DedupReason, apply_to_catalog
from job_engine.services.normalization import (
    NormalizationCandidate,
    normalize_candidate,
)


def _aware_now() -> datetime:
    return datetime(2026, 8, 16, 23, 30, tzinfo=UTC)


def _candidate(**overrides: object) -> NormalizationCandidate:
    payload: dict[str, object] = {
        "source_id": "jobicy",
        "source_posting_id": "abc-123",
        "source_name": "Jobicy",
        "listing_url": "https://jobicy.com/jobs/abc-123",
        "title_original": "Python Engineer",
        "company_original": "Acme Ltd",
        "description": "Build APIs.",
        "location_original": "São Paulo, Brazil",
        "remote_evidence": "Remote",
        "employment_type_evidence": "full-time",
        "seniority_evidence": "Mid-level",
        "compensation_original_text": None,
        "compensation_currency": None,
        "compensation_period": None,
        "compensation_minimum": None,
        "compensation_maximum": None,
        "technologies_original_text": "Python",
        "location_eligibility_evidence": None,
        "published_at": _aware_now(),
        "source_timestamp": _aware_now(),
        "first_seen_at": _aware_now(),
        "last_seen_at": _aware_now(),
        "closed_at": None,
        "status": "active",
        "ingestion_run_id": None,
        "adapter_version": "1.0.0",
        "raw_source_metadata": None,
    }
    payload.update(overrides)
    return NormalizationCandidate.model_validate(payload)


def _corpus() -> list[NormalizationCandidate]:
    return [
        _candidate(
            source_id="jobicy",
            source_posting_id="same-1",
            source_name="Jobicy",
            listing_url="https://boards.example/jobs/shared?utm_source=jobicy",
            title_original="Python Engineer",
            technologies_original_text="Python",
        ),
        _candidate(
            source_id="himalayas",
            source_posting_id="same-2",
            source_name="Himalayas",
            listing_url="https://boards.example/jobs/shared?utm_campaign=board",
            title_original="Python Engineer",
            technologies_original_text="JS",
        ),
        _candidate(
            source_id="jobicy",
            source_posting_id="tuple-1",
            source_name="Jobicy",
            listing_url="https://jobicy.com/jobs/tuple-1",
            title_original="Backend Engineer",
            company_original="Globex Inc.",
            location_original="Remote, Brazil",
        ),
        _candidate(
            source_id="himalayas",
            source_posting_id="tuple-2",
            source_name="Himalayas",
            listing_url="https://himalayas.app/jobs/tuple-2",
            title_original="Backend Engineer",
            company_original="Globex, LLC",
            location_original="Remote, Brazil",
        ),
        _candidate(
            source_id="jobicy",
            source_posting_id="distinct-1",
            source_name="Jobicy",
            listing_url="https://jobicy.com/jobs/distinct-1",
            title_original="Python Engineer",
            company_original="Initech",
        ),
        _candidate(
            source_id="himalayas",
            source_posting_id="distinct-2",
            source_name="Himalayas",
            listing_url="https://himalayas.app/jobs/distinct-2",
            title_original="Senior Python Engineer",
            company_original="Initech",
        ),
        _candidate(
            source_id="jobicy",
            source_posting_id="empty-loc-1",
            source_name="Jobicy",
            listing_url="https://jobicy.com/jobs/empty-1",
            company_original="EmptyLoc Co",
            location_original=None,
        ),
        _candidate(
            source_id="himalayas",
            source_posting_id="empty-loc-2",
            source_name="Himalayas",
            listing_url="https://himalayas.app/jobs/empty-2",
            company_original="EmptyLoc Co",
            location_original=None,
        ),
    ]


async def _apply_corpus(
    repo: CatalogRepository, candidates: list[NormalizationCandidate]
) -> list[tuple[str, str, str]]:
    membership: list[tuple[str, str, str]] = []
    for candidate in candidates:
        result = await apply_to_catalog(repo, normalize_candidate(candidate))
        membership.append(
            (
                str(result.group.id),
                result.posting.source_id,
                result.posting.source_posting_id,
            )
        )
    return membership


async def _counts(session: AsyncSession) -> tuple[int, int]:
    groups = await session.scalar(select(func.count()).select_from(JobGroupRow))
    postings = await session.scalar(select(func.count()).select_from(SourcePostingRow))
    assert groups is not None
    assert postings is not None
    return int(groups), int(postings)


async def test_url_duplicate_joins_and_unions_technologies(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    first = await apply_to_catalog(repo, normalize_candidate(_corpus()[0]))
    second = await apply_to_catalog(repo, normalize_candidate(_corpus()[1]))

    assert first.decision.kind is DedupKind.DISTINCT
    assert second.decision.kind is DedupKind.SAME_JOB_GROUP
    assert second.decision.reason is DedupReason.CANONICAL_URL
    assert second.group.id == first.group.id
    assert {posting.source_id for posting in second.group.source_postings} == {
        "jobicy",
        "himalayas",
    }
    assert {term.term for term in second.group.technologies} == {"Python", "JavaScript"}


async def test_tuple_duplicate_joins_without_deleting_postings(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    first = await apply_to_catalog(repo, normalize_candidate(_corpus()[2]))
    second = await apply_to_catalog(repo, normalize_candidate(_corpus()[3]))

    assert second.decision.kind is DedupKind.SAME_JOB_GROUP
    assert second.decision.reason is DedupReason.IDENTITY_TUPLE
    assert second.group.id == first.group.id
    groups, postings = await _counts(db_session)
    assert groups == 1
    assert postings == 2


async def test_reprocess_same_source_identity_does_not_reassign(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    first = await apply_to_catalog(repo, normalize_candidate(_corpus()[0]))
    again = await apply_to_catalog(repo, normalize_candidate(_corpus()[0]))

    assert again.decision.kind is DedupKind.SAME_POSTING
    assert again.group.id == first.group.id
    groups, postings = await _counts(db_session)
    assert groups == 1
    assert postings == 1


async def test_repeated_corpus_produces_stable_groups_and_counts(
    db_session: AsyncSession,
) -> None:
    repo = CatalogRepository(db_session)
    candidates = _corpus()
    first_membership = await _apply_corpus(repo, candidates)
    first_groups, first_postings = await _counts(db_session)

    second_membership = await _apply_corpus(repo, candidates)
    second_groups, second_postings = await _counts(db_session)

    def membership_sets(
        rows: list[tuple[str, str, str]],
    ) -> dict[str, set[tuple[str, str]]]:
        grouped: dict[str, set[tuple[str, str]]] = {}
        for group_id, source_id, source_posting_id in rows:
            grouped.setdefault(group_id, set()).add((source_id, source_posting_id))
        return grouped

    assert first_groups == second_groups == 6
    assert first_postings == second_postings == 8
    assert membership_sets(first_membership) == membership_sets(second_membership)
    assert all(
        result[0] == first[0]
        for result, first in zip(second_membership, first_membership, strict=True)
    )
