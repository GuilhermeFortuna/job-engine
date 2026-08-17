from __future__ import annotations

from datetime import datetime
from enum import StrEnum
from uuid import UUID

from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import EmploymentType
from job_engine.domain.jobs import (
    EligibleLocation,
    FrozenModel,
    JobGroup,
    JobGroupInput,
    SourcePosting,
    TechnologyTerm,
)
from job_engine.services.normalization import NormalizedRecord


class DedupKind(StrEnum):
    SAME_POSTING = "same_posting"
    SAME_JOB_GROUP = "same_job_group"
    DISTINCT = "distinct"


class DedupReason(StrEnum):
    SOURCE_IDENTITY = "source_identity"
    CANONICAL_URL = "canonical_url"
    IDENTITY_TUPLE = "identity_tuple"
    NO_HIGH_CONFIDENCE_MATCH = "no_high_confidence_match"


class DedupDecision(FrozenModel):
    kind: DedupKind
    reason: DedupReason
    matched_group_id: UUID | None = None


def employment_compatible(left: EmploymentType, right: EmploymentType) -> bool:
    if left is right:
        return True
    return left is EmploymentType.UNKNOWN or right is EmploymentType.UNKNOWN


def decide_duplicate(left: NormalizedRecord, right: NormalizedRecord) -> DedupDecision:
    if (
        left.posting.source_id,
        left.posting.source_posting_id,
    ) == (
        right.posting.source_id,
        right.posting.source_posting_id,
    ):
        return DedupDecision(
            kind=DedupKind.SAME_POSTING, reason=DedupReason.SOURCE_IDENTITY
        )
    if left.canonical_url == right.canonical_url:
        return DedupDecision(
            kind=DedupKind.SAME_JOB_GROUP, reason=DedupReason.CANONICAL_URL
        )
    if (
        left.location_comparison_key
        and left.location_comparison_key == right.location_comparison_key
        and left.company_comparison_key == right.company_comparison_key
        and left.title_comparison_key == right.title_comparison_key
        and employment_compatible(
            left.posting.employment_type, right.posting.employment_type
        )
    ):
        return DedupDecision(
            kind=DedupKind.SAME_JOB_GROUP, reason=DedupReason.IDENTITY_TUPLE
        )
    return DedupDecision(
        kind=DedupKind.DISTINCT, reason=DedupReason.NO_HIGH_CONFIDENCE_MATCH
    )


class CatalogApplyResult(FrozenModel):
    decision: DedupDecision
    posting: SourcePosting
    group: JobGroup


def _later_timestamp(left: datetime, right: datetime) -> datetime:
    return left if left >= right else right


def _union_technologies(
    existing: tuple[TechnologyTerm, ...], incoming: tuple[TechnologyTerm, ...]
) -> tuple[TechnologyTerm, ...]:
    merged = {item.term: item for item in existing}
    for item in incoming:
        merged.setdefault(item.term, item)
    return tuple(merged.values())


def _union_locations(
    existing: tuple[EligibleLocation, ...], incoming: tuple[EligibleLocation, ...]
) -> tuple[EligibleLocation, ...]:
    merged = {item.region: item for item in existing}
    for item in incoming:
        merged.setdefault(item.region, item)
    return tuple(merged.values())


def _union_role_families(
    existing: tuple[str, ...], incoming: tuple[str, ...]
) -> tuple[str, ...]:
    return tuple(dict.fromkeys((*existing, *incoming)))


def _merged_group_input(existing: JobGroup, incoming: JobGroupInput) -> JobGroupInput:
    eligible_locations = _union_locations(
        existing.eligible_locations, incoming.eligible_locations
    )
    return JobGroupInput(
        title=existing.title,
        title_original=existing.title_original,
        title_comparison_key=existing.title_comparison_key,
        company=existing.company,
        company_original=existing.company_original,
        company_comparison_key=existing.company_comparison_key,
        description=existing.description,
        location_original=existing.location_original,
        location_comparison_key=existing.location_comparison_key,
        location_normalized_country=existing.location_normalized_country,
        location_normalized_region=existing.location_normalized_region,
        remote_status=existing.remote_status,
        employment_type=existing.employment_type,
        seniority=existing.seniority,
        seniority_original=existing.seniority_original,
        compensation=existing.compensation,
        published_at=existing.published_at,
        first_seen_at=existing.first_seen_at,
        last_seen_at=_later_timestamp(existing.last_seen_at, incoming.last_seen_at),
        closed_at=existing.closed_at,
        status=existing.status,
        location_eligibility_unknown=not eligible_locations
        and existing.location_eligibility_unknown
        and incoming.location_eligibility_unknown,
        technologies=_union_technologies(existing.technologies, incoming.technologies),
        eligible_locations=eligible_locations,
        role_families=_union_role_families(
            existing.role_families, incoming.role_families
        ),
        last_ingestion_run_id=incoming.last_ingestion_run_id,
    )


async def _join_existing_group(
    repo: CatalogRepository,
    existing: JobGroup,
    posting: SourcePosting,
    record: NormalizedRecord,
    reason: DedupReason,
) -> CatalogApplyResult:
    await repo.add_posting_to_group(existing.id, posting.id)
    merged = await repo.update_job_group(
        existing.id, _merged_group_input(existing, record.group)
    )
    loaded = await repo.get_job_group(existing.id)
    group = loaded if loaded is not None else merged
    return CatalogApplyResult(
        decision=DedupDecision(
            kind=DedupKind.SAME_JOB_GROUP,
            reason=reason,
            matched_group_id=group.id,
        ),
        posting=posting,
        group=group,
    )


async def apply_to_catalog(
    repo: CatalogRepository, record: NormalizedRecord
) -> CatalogApplyResult:
    existing_posting = await repo.get_source_posting(
        record.posting.source_id, record.posting.source_posting_id
    )
    posting = await repo.upsert_source_posting(record.posting)
    if existing_posting is not None:
        group = await repo.get_job_group_by_source_posting(
            record.posting.source_id, record.posting.source_posting_id
        )
        if group is not None:
            updated = await repo.update_job_group(
                group.id, _merged_group_input(group, record.group)
            )
            return CatalogApplyResult(
                decision=DedupDecision(
                    kind=DedupKind.SAME_POSTING,
                    reason=DedupReason.SOURCE_IDENTITY,
                    matched_group_id=updated.id,
                ),
                posting=posting,
                group=updated,
            )

    url_group = await repo.get_job_group_by_canonical_url(record.canonical_url)
    if url_group is not None:
        return await _join_existing_group(
            repo, url_group, posting, record, DedupReason.CANONICAL_URL
        )

    tuple_group = await repo.get_job_group_by_identity_tuple(
        record.company_comparison_key,
        record.title_comparison_key,
        record.location_comparison_key,
        record.posting.employment_type,
    )
    if tuple_group is not None:
        return await _join_existing_group(
            repo, tuple_group, posting, record, DedupReason.IDENTITY_TUPLE
        )

    created = await repo.create_job_group(record.group)
    await repo.add_posting_to_group(created.id, posting.id)
    loaded = await repo.get_job_group(created.id)
    group = loaded if loaded is not None else created
    return CatalogApplyResult(
        decision=DedupDecision(
            kind=DedupKind.DISTINCT,
            reason=DedupReason.NO_HIGH_CONFIDENCE_MATCH,
            matched_group_id=None,
        ),
        posting=posting,
        group=group,
    )
