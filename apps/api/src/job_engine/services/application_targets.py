"""Resolve and persist executable application targets during ingestion."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from job_engine.application_targets import ApplicationTargetInput
from job_engine.application_targets.provider_contract import (
    ProviderId,
    match_provider_url,
)
from job_engine.db.repositories import CatalogRepository
from job_engine.domain.enums import ApplicationTargetStatus, JobStatus
from job_engine.domain.jobs import SourcePosting
from job_engine.services.normalization import canonicalize_url

ATS_SOURCE_PROVIDERS: dict[str, ProviderId] = {
    "greenhouse": "greenhouse",
    "lever": "lever",
}


async def sync_application_target_for_posting(
    repo: CatalogRepository,
    posting: SourcePosting,
    *,
    verified_at: datetime | None = None,
) -> None:
    """Create, update, clear, or downgrade the target for a source posting.

    Aggregator sources never receive a target from listing URL alone.
    ATS-native sources receive an executable target only when the hosted URL
    matches the frozen provider contract and the desktop adapter is supported.
    """
    now = verified_at or datetime.now(UTC)
    existing = await repo.get_application_target_by_source_posting(posting.id)
    provider = ATS_SOURCE_PROVIDERS.get(posting.source_id)

    if posting.status in {JobStatus.CLOSED, JobStatus.STALE}:
        if existing is None:
            return
        if existing.status is ApplicationTargetStatus.UNRESOLVED:
            return
        evidence = dict(existing.evidence)
        evidence["invalidated_reason"] = f"posting_{posting.status.value}"
        evidence["invalidated_at"] = now.isoformat()
        await repo.upsert_application_target(
            ApplicationTargetInput(
                source_posting_id=posting.id,
                target_url=existing.target_url,
                target_url_canonical=existing.target_url_canonical,
                provider=existing.provider,
                desktop_adapter_id=existing.desktop_adapter_id,
                status=ApplicationTargetStatus.UNRESOLVED,
                resolution_method=existing.resolution_method,
                evidence=evidence,
                verified_at=existing.verified_at,
            )
        )
        return

    if provider is None:
        # Aggregators: do not copy listing URL into application_targets.
        return

    match = match_provider_url(posting.listing_url, expected_provider=provider)
    if not match.matched or match.desktop_adapter_id is None:
        if existing is None:
            return
        downgrade_evidence = dict(existing.evidence)
        downgrade_evidence["invalidated_reason"] = (
            match.reason_code or "HOST_PATH_MISMATCH"
        )
        downgrade_evidence["invalidated_at"] = now.isoformat()
        await repo.upsert_application_target(
            ApplicationTargetInput(
                source_posting_id=posting.id,
                target_url=existing.target_url,
                target_url_canonical=existing.target_url_canonical,
                provider=provider,
                desktop_adapter_id=existing.desktop_adapter_id,
                status=ApplicationTargetStatus.UNRESOLVED,
                resolution_method="ats_native_listing",
                evidence=downgrade_evidence,
                verified_at=existing.verified_at,
            )
        )
        return

    canonical = canonicalize_url(posting.listing_url)
    verified_evidence: dict[str, Any] = {
        "contract_match": True,
        "provider": provider,
        "desktop_adapter_id": match.desktop_adapter_id,
        "listing_url": posting.listing_url,
        "source_id": posting.source_id,
        "source_posting_id": posting.source_posting_id,
    }
    await repo.upsert_application_target(
        ApplicationTargetInput(
            source_posting_id=posting.id,
            target_url=posting.listing_url,
            target_url_canonical=canonical,
            provider=provider,
            desktop_adapter_id=match.desktop_adapter_id,
            status=ApplicationTargetStatus.EXECUTABLE,
            resolution_method="ats_native_listing",
            evidence=verified_evidence,
            verified_at=now,
        )
    )
