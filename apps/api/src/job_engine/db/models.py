from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    DateTime,
    ForeignKey,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from job_engine.db.base import Base
from job_engine.domain.enums import (
    EmploymentType,
    IngestionRunStatus,
    JobStatus,
    RemoteStatus,
    Seniority,
)


def _enum_values(enum_cls: type[StrEnum]) -> list[str]:
    return [member.value for member in enum_cls]


remote_status_enum = ENUM(
    RemoteStatus,
    name="remote_status",
    create_type=False,
    values_callable=_enum_values,
)
employment_type_enum = ENUM(
    EmploymentType,
    name="employment_type",
    create_type=False,
    values_callable=_enum_values,
)
seniority_enum = ENUM(
    Seniority,
    name="seniority",
    create_type=False,
    values_callable=_enum_values,
)
job_status_enum = ENUM(
    JobStatus,
    name="job_status",
    create_type=False,
    values_callable=_enum_values,
)
ingestion_run_status_enum = ENUM(
    IngestionRunStatus,
    name="ingestion_run_status",
    create_type=False,
    values_callable=_enum_values,
)


def _utcnow() -> datetime:
    return datetime.now(UTC)


def _uuid_pk() -> Any:
    return mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)


def _required_aware_dt() -> Any:
    return mapped_column(DateTime(timezone=True), nullable=False)


def _optional_aware_dt() -> Any:
    return mapped_column(DateTime(timezone=True))


def _money() -> Any:
    return mapped_column(Numeric(14, 2))


class CompensationMixin:
    compensation_original_text: Mapped[str | None] = mapped_column(Text)
    compensation_currency: Mapped[str | None] = mapped_column(String(16))
    compensation_period: Mapped[str | None] = mapped_column(Text)
    compensation_minimum: Mapped[Decimal | None] = _money()
    compensation_maximum: Mapped[Decimal | None] = _money()
    compensation_annual_usd_minimum: Mapped[Decimal | None] = _money()
    compensation_annual_usd_maximum: Mapped[Decimal | None] = _money()


class IngestionRun(Base):
    __tablename__ = "ingestion_runs"

    id: Mapped[UUID] = _uuid_pk()
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    adapter_version: Mapped[str | None] = mapped_column(Text)
    status: Mapped[IngestionRunStatus] = mapped_column(
        ingestion_run_status_enum, nullable=False
    )
    started_at: Mapped[datetime] = _required_aware_dt()
    completed_at: Mapped[datetime | None] = _optional_aware_dt()
    fetched_count: Mapped[int] = mapped_column(nullable=False, default=0)
    accepted_count: Mapped[int] = mapped_column(nullable=False, default=0)
    rejected_count: Mapped[int] = mapped_column(nullable=False, default=0)
    inserted_count: Mapped[int] = mapped_column(nullable=False, default=0)
    updated_count: Mapped[int] = mapped_column(nullable=False, default=0)
    marked_stale_count: Mapped[int] = mapped_column(nullable=False, default=0)
    marked_closed_count: Mapped[int] = mapped_column(nullable=False, default=0)
    error_summaries: Mapped[list[dict[str, str]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )


class JobGroup(CompensationMixin, Base):
    __tablename__ = "job_groups"

    id: Mapped[UUID] = _uuid_pk()
    title: Mapped[str] = mapped_column(Text, nullable=False)
    title_original: Mapped[str] = mapped_column(Text, nullable=False)
    company: Mapped[str] = mapped_column(Text, nullable=False)
    company_original: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location_original: Mapped[str | None] = mapped_column(Text)
    location_normalized_country: Mapped[str | None] = mapped_column(Text)
    location_normalized_region: Mapped[str | None] = mapped_column(Text)
    remote_status: Mapped[RemoteStatus] = mapped_column(
        remote_status_enum, nullable=False
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        employment_type_enum, nullable=False
    )
    seniority: Mapped[Seniority] = mapped_column(seniority_enum, nullable=False)
    seniority_original: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = _optional_aware_dt()
    first_seen_at: Mapped[datetime] = _required_aware_dt()
    last_seen_at: Mapped[datetime] = _required_aware_dt()
    closed_at: Mapped[datetime | None] = _optional_aware_dt()
    status: Mapped[JobStatus] = mapped_column(job_status_enum, nullable=False)
    location_eligibility_unknown: Mapped[bool] = mapped_column(nullable=False)
    last_ingestion_run_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ingestion_runs.id")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    technologies: Mapped[list["JobGroupTechnology"]] = relationship(
        back_populates="job_group", cascade="all, delete-orphan"
    )
    eligible_locations: Mapped[list["JobGroupEligibleLocation"]] = relationship(
        back_populates="job_group", cascade="all, delete-orphan"
    )
    posting_links: Mapped[list["JobGroupPosting"]] = relationship(
        back_populates="job_group", cascade="all, delete-orphan"
    )


class SourcePosting(CompensationMixin, Base):
    __tablename__ = "source_postings"
    __table_args__ = (
        UniqueConstraint(
            "source_id", "source_posting_id", name="uq_source_postings_source_identity"
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_posting_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    application_url: Mapped[str] = mapped_column(Text, nullable=False)
    title_original: Mapped[str] = mapped_column(Text, nullable=False)
    company_original: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location_original: Mapped[str | None] = mapped_column(Text)
    remote_status: Mapped[RemoteStatus] = mapped_column(
        remote_status_enum, nullable=False
    )
    employment_type: Mapped[EmploymentType] = mapped_column(
        employment_type_enum, nullable=False
    )
    seniority: Mapped[Seniority] = mapped_column(seniority_enum, nullable=False)
    seniority_original: Mapped[str | None] = mapped_column(Text)
    technologies_original_text: Mapped[str | None] = mapped_column(Text)
    location_eligibility_evidence: Mapped[str | None] = mapped_column(Text)
    published_at: Mapped[datetime | None] = _optional_aware_dt()
    source_timestamp: Mapped[datetime | None] = _optional_aware_dt()
    first_seen_at: Mapped[datetime] = _required_aware_dt()
    last_seen_at: Mapped[datetime] = _required_aware_dt()
    closed_at: Mapped[datetime | None] = _optional_aware_dt()
    status: Mapped[JobStatus] = mapped_column(job_status_enum, nullable=False)
    ingestion_run_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("ingestion_runs.id")
    )
    adapter_version: Mapped[str | None] = mapped_column(Text)
    raw_source_metadata: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    group_links: Mapped[list["JobGroupPosting"]] = relationship(
        back_populates="source_posting", cascade="all, delete-orphan"
    )


class JobGroupPosting(Base):
    __tablename__ = "job_group_postings"
    __table_args__ = (
        UniqueConstraint(
            "source_posting_id", name="uq_job_group_postings_source_posting"
        ),
    )

    job_group_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("job_groups.id"), primary_key=True
    )
    source_posting_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("source_postings.id"), primary_key=True
    )
    linked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    job_group: Mapped[JobGroup] = relationship(back_populates="posting_links")
    source_posting: Mapped[SourcePosting] = relationship(back_populates="group_links")


class JobGroupTechnology(Base):
    __tablename__ = "job_group_technologies"
    __table_args__ = (
        UniqueConstraint("job_group_id", "term", name="uq_job_group_technologies_term"),
    )

    id: Mapped[UUID] = _uuid_pk()
    job_group_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("job_groups.id"), nullable=False
    )
    term: Mapped[str] = mapped_column(Text, nullable=False)
    source_text: Mapped[str | None] = mapped_column(Text)

    job_group: Mapped[JobGroup] = relationship(back_populates="technologies")


class JobGroupEligibleLocation(Base):
    __tablename__ = "job_group_eligible_locations"
    __table_args__ = (
        UniqueConstraint(
            "job_group_id", "region", name="uq_job_group_eligible_locations_region"
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    job_group_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("job_groups.id"), nullable=False
    )
    region: Mapped[str] = mapped_column(Text, nullable=False)
    evidence_text: Mapped[str | None] = mapped_column(Text)

    job_group: Mapped[JobGroup] = relationship(back_populates="eligible_locations")
