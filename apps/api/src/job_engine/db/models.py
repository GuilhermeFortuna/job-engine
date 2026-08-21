from datetime import UTC, datetime
from decimal import Decimal
from enum import StrEnum
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    Uuid,
    text,
)
from sqlalchemy.dialects.postgresql import ENUM, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from job_engine.db.base import Base
from job_engine.domain.enums import (
    ApplicationTargetStatus,
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
application_target_status_enum = ENUM(
    ApplicationTargetStatus,
    name="application_target_status",
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
    title_comparison_key: Mapped[str] = mapped_column(Text, nullable=False)
    company: Mapped[str] = mapped_column(Text, nullable=False)
    company_original: Mapped[str] = mapped_column(Text, nullable=False)
    company_comparison_key: Mapped[str] = mapped_column(Text, nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    location_original: Mapped[str | None] = mapped_column(Text)
    location_comparison_key: Mapped[str] = mapped_column(Text, nullable=False)
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
    role_families: Mapped[list["JobGroupRoleFamily"]] = relationship(
        back_populates="job_group", cascade="all, delete-orphan"
    )
    posting_links: Mapped[list["JobGroupPosting"]] = relationship(
        back_populates="job_group", cascade="all, delete-orphan"
    )

    __table_args__ = (
        Index(
            "ix_job_groups_identity_tuple",
            "company_comparison_key",
            "title_comparison_key",
            "location_comparison_key",
        ),
    )


class SourcePosting(CompensationMixin, Base):
    __tablename__ = "source_postings"
    __table_args__ = (
        UniqueConstraint(
            "source_id", "source_posting_id", name="uq_source_postings_source_identity"
        ),
        Index(
            "ix_source_postings_listing_url_canonical",
            "listing_url_canonical",
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    source_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_posting_id: Mapped[str] = mapped_column(Text, nullable=False)
    source_name: Mapped[str] = mapped_column(Text, nullable=False)
    listing_url: Mapped[str] = mapped_column(Text, nullable=False)
    listing_url_canonical: Mapped[str] = mapped_column(Text, nullable=False)
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
    application_target: Mapped["ApplicationTarget | None"] = relationship(
        back_populates="source_posting",
        uselist=False,
        cascade="all, delete-orphan",
    )


class ApplicationTarget(Base):
    __tablename__ = "application_targets"
    __table_args__ = (
        UniqueConstraint(
            "source_posting_id",
            name="uq_application_targets_source_posting_id",
        ),
        Index(
            "ix_application_targets_target_url_canonical",
            "target_url_canonical",
        ),
        Index("ix_application_targets_status", "status"),
    )

    id: Mapped[UUID] = _uuid_pk()
    source_posting_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_postings.id", ondelete="CASCADE"),
        nullable=False,
    )
    target_url: Mapped[str] = mapped_column(Text, nullable=False)
    target_url_canonical: Mapped[str] = mapped_column(Text, nullable=False)
    provider: Mapped[str | None] = mapped_column(Text)
    desktop_adapter_id: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ApplicationTargetStatus] = mapped_column(
        application_target_status_enum, nullable=False
    )
    resolution_method: Mapped[str] = mapped_column(Text, nullable=False)
    evidence: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    verified_at: Mapped[datetime | None] = _optional_aware_dt()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    source_posting: Mapped[SourcePosting] = relationship(
        back_populates="application_target"
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


class JobGroupRoleFamily(Base):
    __tablename__ = "job_group_role_families"
    __table_args__ = (
        UniqueConstraint(
            "job_group_id", "family_id", name="uq_job_group_role_families_family"
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    job_group_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("job_groups.id"), nullable=False
    )
    family_id: Mapped[str] = mapped_column(Text, nullable=False)

    job_group: Mapped[JobGroup] = relationship(back_populates="role_families")


class InstallationState(Base):
    __tablename__ = "installation_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    active_profile_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="SET NULL"),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    active_profile: Mapped["ApplicantProfile | None"] = relationship(
        foreign_keys=[active_profile_id]
    )


class ManagedAsset(Base):
    __tablename__ = "managed_assets"
    __table_args__ = (
        Index("ix_managed_assets_profile_type", "profile_id", "asset_type"),
        Index("ix_managed_assets_sha256", "sha256"),
    )

    id: Mapped[UUID] = _uuid_pk()
    profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    asset_type: Mapped[str] = mapped_column(Text, nullable=False)
    file_name: Mapped[str] = mapped_column(Text, nullable=False)
    content_type: Mapped[str] = mapped_column(Text, nullable=False)
    byte_size: Mapped[int] = mapped_column(BigInteger, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    relative_path: Mapped[str] = mapped_column(Text, nullable=False)
    crop_coordinates: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    extracted_text: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    profile: Mapped["ApplicantProfile"] = relationship(
        back_populates="managed_assets", foreign_keys=[profile_id]
    )


class ApplicantProfile(Base):
    __tablename__ = "applicant_profiles"

    id: Mapped[UUID] = _uuid_pk()
    display_name: Mapped[str] = mapped_column(
        Text, nullable=False, default="Default Applicant"
    )
    avatar_asset_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("managed_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    onboarding_step: Mapped[str] = mapped_column(
        Text, nullable=False, default="profile"
    )
    onboarding_completed_at: Mapped[datetime | None] = _optional_aware_dt()
    archived_at: Mapped[datetime | None] = _optional_aware_dt()
    automation_preferences: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    fields: Mapped[list["ApplicantProfileField"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    avatar_asset: Mapped["ManagedAsset | None"] = relationship(
        foreign_keys=[avatar_asset_id]
    )
    managed_assets: Mapped[list["ManagedAsset"]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        foreign_keys="ManagedAsset.profile_id",
    )
    resumes: Mapped[list["ResumeAsset"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    answers: Mapped[list["ReusableAnswer"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    runs: Mapped[list["ApplicationRun"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )
    application_batches: Mapped[list["ApplicationBatch"]] = relationship(
        back_populates="profile", cascade="all, delete-orphan"
    )


class ApplicantProfileField(Base):
    __tablename__ = "applicant_profile_fields"
    __table_args__ = (
        UniqueConstraint(
            "profile_id", "field_path", name="uq_applicant_profile_fields_path"
        ),
        Index("ix_applicant_profile_fields_profile_path", "profile_id", "field_path"),
    )

    id: Mapped[UUID] = _uuid_pk()
    profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    field_path: Mapped[str] = mapped_column(Text, nullable=False)
    value_state: Mapped[str] = mapped_column(Text, nullable=False)
    value_payload: Mapped[Any | None] = mapped_column(JSONB)
    source: Mapped[str | None] = mapped_column(Text)
    last_confirmed_at: Mapped[datetime | None] = _optional_aware_dt()
    policy_category: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    profile: Mapped[ApplicantProfile] = relationship(back_populates="fields")


class ResumeAsset(Base):
    __tablename__ = "resume_assets"
    __table_args__ = (
        UniqueConstraint(
            "applicant_profile_id",
            "resume_id",
            name="uq_resume_assets_profile_resume_id",
        ),
        Index(
            "uq_resume_assets_profile_default",
            "applicant_profile_id",
            "is_default",
            unique=True,
            postgresql_where=text("is_default IS TRUE"),
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    applicant_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    managed_asset_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("managed_assets.id", ondelete="SET NULL"),
        nullable=True,
    )
    resume_id: Mapped[str] = mapped_column(Text, nullable=False)
    label: Mapped[str] = mapped_column(Text, nullable=False)
    source_markdown_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    upload_pdf_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    preview_html_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    language: Mapped[str] = mapped_column(Text, nullable=False, default="en")
    is_default: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    last_verified_at: Mapped[datetime | None] = _optional_aware_dt()
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    profile: Mapped[ApplicantProfile] = relationship(back_populates="resumes")
    managed_asset: Mapped["ManagedAsset | None"] = relationship()


class ReusableAnswer(Base):
    __tablename__ = "reusable_answers"
    __table_args__ = (
        UniqueConstraint(
            "applicant_profile_id",
            "answer_id",
            name="uq_reusable_answers_profile_answer_id",
        ),
        Index(
            "ix_reusable_answers_profile_intent",
            "applicant_profile_id",
            "question_intent",
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    applicant_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    answer_id: Mapped[str] = mapped_column(Text, nullable=False)
    question_intent: Mapped[str] = mapped_column(Text, nullable=False)
    jurisdiction: Mapped[str | None] = mapped_column(Text)
    platform_scope: Mapped[str | None] = mapped_column(Text)
    answer_text: Mapped[str] = mapped_column(Text, nullable=False)
    policy_category: Mapped[str] = mapped_column(Text, nullable=False)
    provenance: Mapped[str] = mapped_column(
        Text, nullable=False, default="owner_authored"
    )
    last_confirmed_at: Mapped[datetime] = _required_aware_dt()
    expires_at: Mapped[datetime | None] = _optional_aware_dt()
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    profile: Mapped[ApplicantProfile] = relationship(back_populates="answers")


class ApplicationBatch(Base):
    __tablename__ = "application_batches"
    __table_args__ = (
        Index(
            "ix_application_batches_profile_created",
            "applicant_profile_id",
            "created_at",
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    applicant_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    origin: Mapped[str] = mapped_column(Text, nullable=False)
    automation_mode: Mapped[str] = mapped_column(Text, nullable=False)
    applicant_profile_version: Mapped[int] = mapped_column(Integer, nullable=False)
    resume_asset_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("resume_assets.id"), nullable=False
    )
    resume_asset_version: Mapped[int] = mapped_column(Integer, nullable=False)
    resume_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    answer_bank_snapshot: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)
    answer_bank_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    known_capability_exceptions: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    policy_revision: Mapped[str] = mapped_column(Text, nullable=False)
    confirmation_text_revision: Mapped[str] = mapped_column(Text, nullable=False)
    confirmation_text: Mapped[str] = mapped_column(Text, nullable=False)
    owner_confirmed_at: Mapped[datetime] = _required_aware_dt()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )

    profile: Mapped[ApplicantProfile] = relationship(
        back_populates="application_batches"
    )
    resume_asset: Mapped[ResumeAsset] = relationship()
    items: Mapped[list["ApplicationBatchItem"]] = relationship(
        back_populates="batch",
        cascade="all, delete-orphan",
        order_by="ApplicationBatchItem.position.asc()",
    )
    runs: Mapped[list["ApplicationRun"]] = relationship(
        back_populates="batch",
        foreign_keys="ApplicationRun.batch_id",
    )


class ApplicationBatchItem(Base):
    __tablename__ = "application_batch_items"
    __table_args__ = (
        UniqueConstraint(
            "batch_id",
            "position",
            name="uq_application_batch_items_batch_position",
        ),
        Index(
            "ix_application_batch_items_batch_position",
            "batch_id",
            "position",
        ),
        Index(
            "ix_application_batch_items_run_id",
            "run_id",
            unique=True,
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    batch_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_batches.id", ondelete="CASCADE"),
        nullable=False,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    job_group_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("job_groups.id"), nullable=False
    )
    application_target_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_targets.id", ondelete="SET NULL"),
        nullable=True,
    )
    source_posting_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("source_postings.id", ondelete="SET NULL"),
        nullable=True,
    )
    canonical_application_url: Mapped[str] = mapped_column(Text, nullable=False)
    application_url: Mapped[str] = mapped_column(Text, nullable=False)
    platform_adapter_id: Mapped[str] = mapped_column(Text, nullable=False)
    duplicate_override_reason: Mapped[str | None] = mapped_column(Text)
    run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_runs.id", ondelete="RESTRICT"),
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    batch: Mapped[ApplicationBatch] = relationship(back_populates="items")
    run: Mapped["ApplicationRun"] = relationship(
        back_populates="batch_item",
        foreign_keys=[run_id],
    )


class ApplicationRun(Base):
    __tablename__ = "application_runs"
    __table_args__ = (
        Index("ix_application_runs_status", "status"),
        Index("ix_application_runs_canonical_url", "canonical_application_url"),
        Index("ix_application_runs_queue_order", "status", "created_at"),
        Index("ix_application_runs_lease_expires", "lease_expires_at"),
        Index("ix_application_runs_profile_status", "applicant_profile_id", "status"),
        Index("ix_application_runs_batch_id", "batch_id"),
        Index(
            "uq_application_runs_batch_item_id",
            "batch_item_id",
            unique=True,
        ),
        Index(
            "uq_application_runs_active_or_submitted_url",
            "applicant_profile_id",
            "canonical_application_url",
            unique=True,
            postgresql_where=text(
                "status IN ('queued', 'claimed', 'running', 'needs_input', "
                "'paused_auth', 'failed_retryable', 'submitted') "
                "AND duplicate_override_confirmed_at IS NULL"
            ),
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    applicant_profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    batch_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_batches.id", ondelete="RESTRICT"),
        nullable=False,
    )
    batch_item_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_batch_items.id", ondelete="RESTRICT"),
        nullable=False,
    )
    job_group_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("job_groups.id"), nullable=False
    )
    source_posting_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("source_postings.id")
    )
    canonical_application_url: Mapped[str] = mapped_column(Text, nullable=False)
    application_url: Mapped[str] = mapped_column(Text, nullable=False)
    platform_adapter_id: Mapped[str] = mapped_column(Text, nullable=False)
    resume_asset_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("resume_assets.id"), nullable=False
    )
    resume_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    applicant_profile_version: Mapped[int] = mapped_column(Integer, nullable=False)
    answer_bank_snapshot: Mapped[dict[str, int]] = mapped_column(JSONB, nullable=False)
    answer_bank_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    automation_mode: Mapped[str] = mapped_column(Text, nullable=False)
    automatic_submission_authorized_at: Mapped[datetime | None] = _optional_aware_dt()
    status: Mapped[str] = mapped_column(Text, nullable=False, default="queued")
    current_step: Mapped[str | None] = mapped_column(Text)
    current_checkpoint: Mapped[str | None] = mapped_column(Text)
    submit_attempted_at: Mapped[datetime | None] = _optional_aware_dt()
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    retry_failure_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=2)
    idempotency_key: Mapped[str] = mapped_column(String(64), nullable=False)
    lease_token_hash: Mapped[str | None] = mapped_column(String(64))
    lease_expires_at: Mapped[datetime | None] = _optional_aware_dt()
    runner_id: Mapped[str | None] = mapped_column(Text)
    terminal_reason: Mapped[str | None] = mapped_column(Text)
    receipt_summary: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    policy_snapshot: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    duplicate_override_confirmed_at: Mapped[datetime | None] = _optional_aware_dt()
    duplicate_override_reason: Mapped[str | None] = mapped_column(Text)
    provider_call_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    provider_reserved_cost_usd: Mapped[Decimal] = mapped_column(
        Numeric(10, 4), nullable=False, default=Decimal("0")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
    started_at: Mapped[datetime | None] = _optional_aware_dt()
    completed_at: Mapped[datetime | None] = _optional_aware_dt()

    profile: Mapped[ApplicantProfile] = relationship(back_populates="runs")
    batch: Mapped[ApplicationBatch] = relationship(
        back_populates="runs",
        foreign_keys=[batch_id],
    )
    batch_item: Mapped[ApplicationBatchItem] = relationship(
        back_populates="run",
        foreign_keys=[ApplicationBatchItem.run_id],
        uselist=False,
    )
    job_group: Mapped[JobGroup] = relationship()
    resume_asset: Mapped[ResumeAsset] = relationship()
    events: Mapped[list["ApplicationRunEvent"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ApplicationRunEvent.sequence_num.asc()",
    )
    exceptions: Mapped[list["ApplicationRunException"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ApplicationRunException.created_at.asc()",
    )
    evidence: Mapped[list["ApplicationRunEvidence"]] = relationship(
        back_populates="run",
        cascade="all, delete-orphan",
        order_by="ApplicationRunEvidence.captured_at.asc()",
    )
    resume_grants: Mapped[list["ApplicationRunResumeGrant"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )
    lease_releases: Mapped[list["ApplicationRunLeaseRelease"]] = relationship(
        back_populates="run", cascade="all, delete-orphan"
    )


class ApplicationRunEvent(Base):
    __tablename__ = "application_run_events"
    __table_args__ = (
        UniqueConstraint(
            "run_id", "sequence_num", name="uq_application_run_events_sequence"
        ),
        Index(
            "uq_application_run_events_idempotency",
            "run_id",
            "idempotency_key",
            unique=True,
            postgresql_where=text("idempotency_key IS NOT NULL"),
        ),
        Index("ix_application_run_events_run_created", "run_id", "created_at"),
        Index("ix_application_run_events_created", "created_at"),
    )

    id: Mapped[UUID] = _uuid_pk()
    run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    sequence_num: Mapped[int] = mapped_column(Integer, nullable=False)
    event_type: Mapped[str] = mapped_column(Text, nullable=False)
    event_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    idempotency_key: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    run: Mapped[ApplicationRun] = relationship(back_populates="events")


class ApplicationRunException(Base):
    __tablename__ = "application_run_exceptions"
    __table_args__ = (
        Index("ix_application_run_exceptions_run_status", "run_id", "status"),
    )

    id: Mapped[UUID] = _uuid_pk()
    run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    exception_type: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False, default="pending")
    context_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    resolution_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    resolved_at: Mapped[datetime | None] = _optional_aware_dt()

    run: Mapped[ApplicationRun] = relationship(back_populates="exceptions")


class ApplicationRunEvidence(Base):
    __tablename__ = "application_run_evidence"
    __table_args__ = (Index("ix_application_run_evidence_run", "run_id"),)

    id: Mapped[UUID] = _uuid_pk()
    run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    evidence_type: Mapped[str] = mapped_column(Text, nullable=False)
    relative_path: Mapped[str] = mapped_column(Text, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    file_size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    captured_at: Mapped[datetime] = _required_aware_dt()
    metadata_payload: Mapped[dict[str, Any] | None] = mapped_column(JSONB)

    run: Mapped[ApplicationRun] = relationship(back_populates="evidence")


class ApplicationRunResumeGrant(Base):
    __tablename__ = "application_run_resume_grants"
    __table_args__ = (
        UniqueConstraint(
            "grant_token_hash", name="uq_application_run_resume_grants_token_hash"
        ),
        Index("ix_application_run_resume_grants_run_expires", "run_id", "expires_at"),
    )

    id: Mapped[UUID] = _uuid_pk()
    run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    resume_asset_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("resume_assets.id"), nullable=False
    )
    grant_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    expires_at: Mapped[datetime] = _required_aware_dt()
    consumed_at: Mapped[datetime | None] = _optional_aware_dt()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    run: Mapped[ApplicationRun] = relationship(back_populates="resume_grants")
    resume_asset: Mapped[ResumeAsset] = relationship()


class ApplicationRunLeaseRelease(Base):
    """Durable record of a runner voluntarily relinquishing a claim.

    Authorizes idempotent replay of ``release-claim``: a replay must present the
    same lease token, runner ID, reason, and request ID that produced the row,
    and the row must not have been superseded by a later claim.
    """

    __tablename__ = "application_run_lease_releases"
    __table_args__ = (
        UniqueConstraint(
            "run_id",
            "released_lease_token_hash",
            name="uq_application_run_lease_releases_run_token",
        ),
        Index(
            "ix_application_run_lease_releases_run_superseded",
            "run_id",
            "superseded_at",
        ),
    )

    id: Mapped[UUID] = _uuid_pk()
    run_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("application_runs.id", ondelete="CASCADE"),
        nullable=False,
    )
    attempt: Mapped[int] = mapped_column(Integer, nullable=False)
    released_lease_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    runner_id: Mapped[str] = mapped_column(Text, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    request_id: Mapped[str] = mapped_column(Text, nullable=False)
    superseded_at: Mapped[datetime | None] = _optional_aware_dt()
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )

    run: Mapped[ApplicationRun] = relationship(back_populates="lease_releases")


class LocalAiSelfTest(Base):
    """Singleton sanitized local-AI self-test diagnostics."""

    __tablename__ = "local_ai_self_test"
    __table_args__ = (
        CheckConstraint("id = 1", name="ck_local_ai_self_test_singleton"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    passed: Mapped[bool | None] = mapped_column(Boolean)
    model: Mapped[str | None] = mapped_column(Text)
    schema_revision: Mapped[str | None] = mapped_column(Text)
    prompt_revision: Mapped[str | None] = mapped_column(Text)
    latency_ms: Mapped[int | None] = mapped_column(Integer)
    failure_code: Mapped[str | None] = mapped_column(Text)
    tested_at: Mapped[datetime | None] = _optional_aware_dt()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )


class LocalAiProfileProposal(Base):
    __tablename__ = "local_ai_profile_proposals"
    __table_args__ = (
        Index(
            "ix_local_ai_profile_proposals_profile",
            "profile_id",
            "created_at",
        ),
        Index("ix_local_ai_profile_proposals_asset", "source_asset_id"),
    )

    id: Mapped[UUID] = _uuid_pk()
    profile_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_asset_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("managed_assets.id", ondelete="CASCADE"),
        nullable=False,
    )
    source_asset_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    status: Mapped[str] = mapped_column(Text, nullable=False)
    schema_revision: Mapped[str] = mapped_column(Text, nullable=False)
    prompt_revision: Mapped[str] = mapped_column(Text, nullable=False)
    model: Mapped[str] = mapped_column(Text, nullable=False)
    proposal_payload: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict
    )
    accepted_field_paths: Mapped[list[Any]] = mapped_column(
        JSONB, nullable=False, default=list
    )
    failure_code: Mapped[str | None] = mapped_column(Text)
    deterministic_extraction_ok: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utcnow, onupdate=_utcnow
    )
