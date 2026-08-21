"""Deterministic preferred application target selection for grouped jobs."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from job_engine.api.schemas import PreferredApplicationTarget
from job_engine.application_targets import target_status_rank
from job_engine.db import models as orm
from job_engine.db.repositories import LinkedSourcePosting
from job_engine.domain.enums import ApplicationTargetStatus


@dataclass(frozen=True)
class _Candidate:
    status: ApplicationTargetStatus
    linked_at: datetime
    posting_id: UUID
    listing_url: str
    target: orm.ApplicationTarget | None


def _assisted_reason(status: ApplicationTargetStatus) -> str | None:
    if status is ApplicationTargetStatus.ASSISTED:
        return "Open the best known safe URL; Auto Apply is not available."
    if status is ApplicationTargetStatus.EXTERNAL:
        return "Open the external listing URL; this target is not Auto Apply capable."
    if status is ApplicationTargetStatus.UNRESOLVED:
        return "No verified executable application target is available yet."
    return None


def select_preferred_application_target(
    links: tuple[LinkedSourcePosting, ...],
) -> PreferredApplicationTarget:
    """Prefer executable > assisted > external > unresolved.

    Ties break by earliest source link time, then stable source posting UUID.
    """
    candidates: list[_Candidate] = []
    for link in links:
        target = link.target
        if target is None:
            candidates.append(
                _Candidate(
                    status=ApplicationTargetStatus.UNRESOLVED,
                    linked_at=link.linked_at,
                    posting_id=link.row.id,
                    listing_url=link.row.listing_url,
                    target=None,
                )
            )
            continue
        candidates.append(
            _Candidate(
                status=target.status,
                linked_at=link.linked_at,
                posting_id=link.row.id,
                listing_url=link.row.listing_url,
                target=target,
            )
        )

    if not candidates:
        return PreferredApplicationTarget(
            id=None,
            target_url=None,
            listing_url=None,
            provider=None,
            desktop_adapter_id=None,
            status=ApplicationTargetStatus.UNRESOLVED,
            resolution_method=None,
            verified_at=None,
            source_posting_id=None,
            assisted_reason=_assisted_reason(ApplicationTargetStatus.UNRESOLVED),
        )

    candidates.sort(
        key=lambda item: (
            target_status_rank(item.status),
            item.linked_at,
            str(item.posting_id),
        )
    )
    chosen = candidates[0]
    if chosen.target is None:
        return PreferredApplicationTarget(
            id=None,
            target_url=None,
            listing_url=chosen.listing_url,
            provider=None,
            desktop_adapter_id=None,
            status=ApplicationTargetStatus.UNRESOLVED,
            resolution_method=None,
            verified_at=None,
            source_posting_id=chosen.posting_id,
            assisted_reason=_assisted_reason(ApplicationTargetStatus.UNRESOLVED),
        )
    return PreferredApplicationTarget(
        id=chosen.target.id,
        target_url=chosen.target.target_url,
        listing_url=chosen.listing_url,
        provider=chosen.target.provider,
        desktop_adapter_id=chosen.target.desktop_adapter_id,
        status=chosen.target.status,
        resolution_method=chosen.target.resolution_method,
        verified_at=chosen.target.verified_at,
        source_posting_id=chosen.posting_id,
        assisted_reason=_assisted_reason(chosen.target.status),
    )
