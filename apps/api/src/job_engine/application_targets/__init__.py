"""Application target domain models (BACK-016)."""

from __future__ import annotations

from datetime import UTC, datetime
from typing import Any, Literal
from urllib.parse import urlparse
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator

from job_engine.domain.enums import ApplicationTargetStatus

ProviderId = Literal["greenhouse", "lever"]
ResolutionMethod = Literal[
    "ats_native_listing",
    "bounded_redirect_resolver",
    "manual_owner",
]


def _require_aware_utc(value: datetime) -> datetime:
    if value.tzinfo is None or value.tzinfo.utcoffset(value) is None:
        raise ValueError("datetime must be timezone-aware UTC")
    return value.astimezone(UTC)


def _require_http_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be an HTTP or HTTPS URL")
    return value


class FrozenModel(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")


class ApplicationTargetInput(FrozenModel):
    source_posting_id: UUID
    target_url: str
    target_url_canonical: str
    provider: ProviderId | None = None
    desktop_adapter_id: str | None = None
    status: ApplicationTargetStatus
    resolution_method: ResolutionMethod
    evidence: dict[str, Any] = Field(default_factory=dict)
    verified_at: datetime | None = None

    @field_validator("target_url", "target_url_canonical")
    @classmethod
    def urls_must_be_http(cls, value: str) -> str:
        return _require_http_url(value)

    @field_validator("verified_at")
    @classmethod
    def verified_at_must_be_utc(cls, value: datetime | None) -> datetime | None:
        if value is None:
            return None
        return _require_aware_utc(value)


class ApplicationTarget(ApplicationTargetInput):
    id: UUID
    created_at: datetime
    updated_at: datetime

    @field_validator("created_at", "updated_at")
    @classmethod
    def timestamps_must_be_utc(cls, value: datetime) -> datetime:
        return _require_aware_utc(value)


STATUS_PREFERENCE: tuple[ApplicationTargetStatus, ...] = (
    ApplicationTargetStatus.EXECUTABLE,
    ApplicationTargetStatus.ASSISTED,
    ApplicationTargetStatus.EXTERNAL,
    ApplicationTargetStatus.UNRESOLVED,
)


def target_status_rank(status: ApplicationTargetStatus | None) -> int:
    if status is None:
        return len(STATUS_PREFERENCE)
    try:
        return STATUS_PREFERENCE.index(status)
    except ValueError:
        return len(STATUS_PREFERENCE)
