"""Add application runs, events, exceptions, evidence, and resume grants.

Revision ID: 0004_add_application_runs
Revises: 0003_add_applicant_vault
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004_add_application_runs"
down_revision: str | None = "0003_add_applicant_vault"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. application_runs table
    op.create_table(
        "application_runs",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_group_id", sa.Uuid(), nullable=False),
        sa.Column("source_posting_id", sa.Uuid(), nullable=True),
        sa.Column("canonical_application_url", sa.Text(), nullable=False),
        sa.Column("application_url", sa.Text(), nullable=False),
        sa.Column("platform_adapter_id", sa.Text(), nullable=False),
        sa.Column("resume_asset_id", sa.Uuid(), nullable=False),
        sa.Column("resume_sha256", sa.String(length=64), nullable=False),
        sa.Column("applicant_profile_version", sa.Integer(), nullable=False),
        sa.Column(
            "answer_bank_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("answer_bank_hash", sa.String(length=64), nullable=False),
        sa.Column("automation_mode", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="queued",
        ),
        sa.Column("current_step", sa.Text(), nullable=True),
        sa.Column("current_checkpoint", sa.Text(), nullable=True),
        sa.Column("submit_attempted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "attempt_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "max_retries",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("2"),
        ),
        sa.Column("idempotency_key", sa.String(length=64), nullable=False),
        sa.Column("lease_token_hash", sa.String(length=64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("runner_id", sa.Text(), nullable=True),
        sa.Column("terminal_reason", sa.Text(), nullable=True),
        sa.Column(
            "receipt_summary",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "policy_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "duplicate_override_confirmed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
        sa.Column("duplicate_override_reason", sa.Text(), nullable=True),
        sa.Column(
            "provider_call_count",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "provider_reserved_cost_usd",
            sa.Numeric(precision=10, scale=4),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["job_group_id"],
            ["job_groups.id"],
        ),
        sa.ForeignKeyConstraint(
            ["resume_asset_id"],
            ["resume_assets.id"],
        ),
        sa.ForeignKeyConstraint(
            ["source_posting_id"],
            ["source_postings.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_application_runs_status", "application_runs", ["status"])
    op.create_index(
        "ix_application_runs_canonical_url",
        "application_runs",
        ["canonical_application_url"],
    )
    op.create_index(
        "ix_application_runs_queue_order",
        "application_runs",
        ["status", "created_at"],
    )
    op.create_index(
        "ix_application_runs_lease_expires",
        "application_runs",
        ["lease_expires_at"],
    )
    op.create_index(
        "uq_application_runs_active_or_submitted_url",
        "application_runs",
        ["canonical_application_url"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('queued', 'claimed', 'running', 'needs_input', "
            "'paused_auth', 'failed_retryable', 'submitted') "
            "AND duplicate_override_confirmed_at IS NULL"
        ),
    )
    op.create_index(
        "uq_application_runs_active_or_submitted_job_group",
        "application_runs",
        ["job_group_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('queued', 'claimed', 'running', 'needs_input', "
            "'paused_auth', 'failed_retryable', 'submitted') "
            "AND duplicate_override_confirmed_at IS NULL"
        ),
    )

    # 2. application_run_events table
    op.create_table(
        "application_run_events",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column(
            "attempt",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("sequence_num", sa.Integer(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column(
            "event_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("idempotency_key", sa.Text(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["application_runs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_id", "sequence_num", name="uq_application_run_events_sequence"
        ),
    )
    op.create_index(
        "uq_application_run_events_idempotency",
        "application_run_events",
        ["run_id", "idempotency_key"],
        unique=True,
        postgresql_where=sa.text("idempotency_key IS NOT NULL"),
    )
    op.create_index(
        "ix_application_run_events_run_created",
        "application_run_events",
        ["run_id", "created_at"],
    )
    op.create_index(
        "ix_application_run_events_created",
        "application_run_events",
        ["created_at"],
    )

    # 3. application_run_exceptions table
    op.create_table(
        "application_run_exceptions",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("exception_type", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Text(),
            nullable=False,
            server_default="pending",
        ),
        sa.Column(
            "context_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "resolution_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["application_runs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_application_run_exceptions_run_status",
        "application_run_exceptions",
        ["run_id", "status"],
    )

    # 4. application_run_evidence table
    op.create_table(
        "application_run_evidence",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column(
            "attempt",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("1"),
        ),
        sa.Column("evidence_type", sa.Text(), nullable=False),
        sa.Column("relative_path", sa.Text(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("captured_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column(
            "metadata_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["application_runs.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_application_run_evidence_run",
        "application_run_evidence",
        ["run_id"],
    )

    # 5. application_run_resume_grants table
    op.create_table(
        "application_run_resume_grants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("resume_asset_id", sa.Uuid(), nullable=False),
        sa.Column("grant_token_hash", sa.String(length=64), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["run_id"],
            ["application_runs.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["resume_asset_id"],
            ["resume_assets.id"],
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "grant_token_hash",
            name="uq_application_run_resume_grants_token_hash",
        ),
    )
    op.create_index(
        "ix_application_run_resume_grants_run_expires",
        "application_run_resume_grants",
        ["run_id", "expires_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_application_run_resume_grants_run_expires",
        table_name="application_run_resume_grants",
    )
    op.drop_table("application_run_resume_grants")
    op.drop_index(
        "ix_application_run_evidence_run",
        table_name="application_run_evidence",
    )
    op.drop_table("application_run_evidence")
    op.drop_index(
        "ix_application_run_exceptions_run_status",
        table_name="application_run_exceptions",
    )
    op.drop_table("application_run_exceptions")
    op.drop_index(
        "ix_application_run_events_created",
        table_name="application_run_events",
    )
    op.drop_index(
        "ix_application_run_events_run_created",
        table_name="application_run_events",
    )
    op.drop_index(
        "uq_application_run_events_idempotency",
        table_name="application_run_events",
    )
    op.drop_table("application_run_events")
    op.drop_index(
        "uq_application_runs_active_or_submitted_job_group",
        table_name="application_runs",
    )
    op.drop_index(
        "uq_application_runs_active_or_submitted_url",
        table_name="application_runs",
    )
    op.drop_index(
        "ix_application_runs_lease_expires",
        table_name="application_runs",
    )
    op.drop_index(
        "ix_application_runs_queue_order",
        table_name="application_runs",
    )
    op.drop_index(
        "ix_application_runs_canonical_url",
        table_name="application_runs",
    )
    op.drop_index(
        "ix_application_runs_status",
        table_name="application_runs",
    )
    op.drop_table("application_runs")
