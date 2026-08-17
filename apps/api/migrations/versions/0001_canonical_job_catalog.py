"""Canonical job catalog tables and enums.

Revision ID: 0001_canonical_job_catalog
Revises:
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001_canonical_job_catalog"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

remote_status = postgresql.ENUM(
    "remote", "hybrid", "onsite", "unknown", name="remote_status", create_type=False
)
employment_type = postgresql.ENUM(
    "full_time",
    "part_time",
    "contract",
    "temporary",
    "internship",
    "unknown",
    name="employment_type",
    create_type=False,
)
seniority = postgresql.ENUM(
    "internship",
    "junior",
    "mid",
    "senior",
    "lead_staff",
    "unknown",
    name="seniority",
    create_type=False,
)
job_status = postgresql.ENUM(
    "active", "stale", "closed", "unknown", name="job_status", create_type=False
)
ingestion_run_status = postgresql.ENUM(
    "running",
    "success",
    "partial_success",
    "failure",
    name="ingestion_run_status",
    create_type=False,
)

compensation_numeric = sa.Numeric(14, 2)


def upgrade() -> None:
    bind = op.get_bind()
    remote_status.create(bind, checkfirst=False)
    employment_type.create(bind, checkfirst=False)
    seniority.create(bind, checkfirst=False)
    job_status.create(bind, checkfirst=False)
    ingestion_run_status.create(bind, checkfirst=False)

    op.create_table(
        "ingestion_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("adapter_version", sa.Text(), nullable=True),
        sa.Column("status", ingestion_run_status, nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("fetched_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("accepted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rejected_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("inserted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column(
            "marked_stale_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "marked_closed_count", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column(
            "error_summaries",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "job_groups",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("title_original", sa.Text(), nullable=False),
        sa.Column("company", sa.Text(), nullable=False),
        sa.Column("company_original", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_original", sa.Text(), nullable=True),
        sa.Column("location_normalized_country", sa.Text(), nullable=True),
        sa.Column("location_normalized_region", sa.Text(), nullable=True),
        sa.Column("remote_status", remote_status, nullable=False),
        sa.Column("employment_type", employment_type, nullable=False),
        sa.Column("seniority", seniority, nullable=False),
        sa.Column("seniority_original", sa.Text(), nullable=True),
        sa.Column("compensation_original_text", sa.Text(), nullable=True),
        sa.Column("compensation_currency", sa.String(length=16), nullable=True),
        sa.Column("compensation_period", sa.Text(), nullable=True),
        sa.Column("compensation_minimum", compensation_numeric, nullable=True),
        sa.Column("compensation_maximum", compensation_numeric, nullable=True),
        sa.Column(
            "compensation_annual_usd_minimum", compensation_numeric, nullable=True
        ),
        sa.Column(
            "compensation_annual_usd_maximum", compensation_numeric, nullable=True
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", job_status, nullable=False),
        sa.Column("location_eligibility_unknown", sa.Boolean(), nullable=False),
        sa.Column("last_ingestion_run_id", sa.Uuid(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["last_ingestion_run_id"], ["ingestion_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "source_postings",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("source_id", sa.Text(), nullable=False),
        sa.Column("source_posting_id", sa.Text(), nullable=False),
        sa.Column("source_name", sa.Text(), nullable=False),
        sa.Column("application_url", sa.Text(), nullable=False),
        sa.Column("title_original", sa.Text(), nullable=False),
        sa.Column("company_original", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("location_original", sa.Text(), nullable=True),
        sa.Column("remote_status", remote_status, nullable=False),
        sa.Column("employment_type", employment_type, nullable=False),
        sa.Column("seniority", seniority, nullable=False),
        sa.Column("seniority_original", sa.Text(), nullable=True),
        sa.Column("compensation_original_text", sa.Text(), nullable=True),
        sa.Column("compensation_currency", sa.String(length=16), nullable=True),
        sa.Column("compensation_period", sa.Text(), nullable=True),
        sa.Column("compensation_minimum", compensation_numeric, nullable=True),
        sa.Column("compensation_maximum", compensation_numeric, nullable=True),
        sa.Column(
            "compensation_annual_usd_minimum", compensation_numeric, nullable=True
        ),
        sa.Column(
            "compensation_annual_usd_maximum", compensation_numeric, nullable=True
        ),
        sa.Column("technologies_original_text", sa.Text(), nullable=True),
        sa.Column("location_eligibility_evidence", sa.Text(), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("source_timestamp", sa.DateTime(timezone=True), nullable=True),
        sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("closed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("status", job_status, nullable=False),
        sa.Column("ingestion_run_id", sa.Uuid(), nullable=True),
        sa.Column("adapter_version", sa.Text(), nullable=True),
        sa.Column(
            "raw_source_metadata",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["ingestion_run_id"], ["ingestion_runs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "source_id", "source_posting_id", name="uq_source_postings_source_identity"
        ),
    )
    op.create_table(
        "job_group_postings",
        sa.Column("job_group_id", sa.Uuid(), nullable=False),
        sa.Column("source_posting_id", sa.Uuid(), nullable=False),
        sa.Column("linked_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["job_group_id"], ["job_groups.id"]),
        sa.ForeignKeyConstraint(["source_posting_id"], ["source_postings.id"]),
        sa.PrimaryKeyConstraint("job_group_id", "source_posting_id"),
        sa.UniqueConstraint(
            "source_posting_id", name="uq_job_group_postings_source_posting"
        ),
    )
    op.create_table(
        "job_group_technologies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_group_id", sa.Uuid(), nullable=False),
        sa.Column("term", sa.Text(), nullable=False),
        sa.Column("source_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["job_group_id"], ["job_groups.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_group_id", "term", name="uq_job_group_technologies_term"
        ),
    )
    op.create_table(
        "job_group_eligible_locations",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_group_id", sa.Uuid(), nullable=False),
        sa.Column("region", sa.Text(), nullable=False),
        sa.Column("evidence_text", sa.Text(), nullable=True),
        sa.ForeignKeyConstraint(["job_group_id"], ["job_groups.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_group_id", "region", name="uq_job_group_eligible_locations_region"
        ),
    )


def downgrade() -> None:
    op.drop_table("job_group_eligible_locations")
    op.drop_table("job_group_technologies")
    op.drop_table("job_group_postings")
    op.drop_table("source_postings")
    op.drop_table("job_groups")
    op.drop_table("ingestion_runs")
    bind = op.get_bind()
    ingestion_run_status.drop(bind, checkfirst=False)
    job_status.drop(bind, checkfirst=False)
    seniority.drop(bind, checkfirst=False)
    employment_type.drop(bind, checkfirst=False)
    remote_status.drop(bind, checkfirst=False)
