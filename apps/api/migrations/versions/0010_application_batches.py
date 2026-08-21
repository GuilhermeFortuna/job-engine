"""Durable application batches and legacy run backfill.

Revision ID: 0010_application_batches
Revises: 0009_executable_targets
Create Date: 2026-08-21
"""

import json
from collections.abc import Sequence
from uuid import UUID, uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010_application_batches"
down_revision: str | None = "0009_executable_targets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

BATCH_CONFIRMATION_TEXT = "Authorize automatic submission for these selected jobs"
BATCH_CONFIRMATION_REVISION = "back-017.1"
BATCH_POLICY_REVISION = "back-017.1"


def upgrade() -> None:
    op.create_table(
        "application_batches",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "applicant_profile_id",
            sa.Uuid(),
            sa.ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("origin", sa.Text(), nullable=False),
        sa.Column("automation_mode", sa.Text(), nullable=False),
        sa.Column("applicant_profile_version", sa.Integer(), nullable=False),
        sa.Column(
            "resume_asset_id",
            sa.Uuid(),
            sa.ForeignKey("resume_assets.id"),
            nullable=False,
        ),
        sa.Column("resume_asset_version", sa.Integer(), nullable=False),
        sa.Column("resume_sha256", sa.String(length=64), nullable=False),
        sa.Column(
            "answer_bank_snapshot",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
        ),
        sa.Column("answer_bank_hash", sa.String(length=64), nullable=False),
        sa.Column(
            "known_capability_exceptions",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("policy_revision", sa.Text(), nullable=False),
        sa.Column("confirmation_text_revision", sa.Text(), nullable=False),
        sa.Column("confirmation_text", sa.Text(), nullable=False),
        sa.Column(
            "owner_confirmed_at",
            sa.DateTime(timezone=True),
            nullable=False,
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
    )
    op.create_index(
        "ix_application_batches_profile_created",
        "application_batches",
        ["applicant_profile_id", "created_at"],
    )

    op.create_table(
        "application_batch_items",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "batch_id",
            sa.Uuid(),
            sa.ForeignKey("application_batches.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column(
            "job_group_id",
            sa.Uuid(),
            sa.ForeignKey("job_groups.id"),
            nullable=False,
        ),
        sa.Column(
            "application_target_id",
            sa.Uuid(),
            sa.ForeignKey("application_targets.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "source_posting_id",
            sa.Uuid(),
            sa.ForeignKey("source_postings.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("canonical_application_url", sa.Text(), nullable=False),
        sa.Column("application_url", sa.Text(), nullable=False),
        sa.Column("platform_adapter_id", sa.Text(), nullable=False),
        sa.Column("duplicate_override_reason", sa.Text(), nullable=True),
        sa.Column(
            "run_id",
            sa.Uuid(),
            nullable=True,
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint(
            "batch_id",
            "position",
            name="uq_application_batch_items_batch_position",
        ),
    )
    op.create_index(
        "ix_application_batch_items_batch_position",
        "application_batch_items",
        ["batch_id", "position"],
    )
    op.create_index(
        "ix_application_batch_items_run_id",
        "application_batch_items",
        ["run_id"],
        unique=True,
        postgresql_where=sa.text("run_id IS NOT NULL"),
    )

    op.add_column(
        "application_runs",
        sa.Column("batch_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "application_runs",
        sa.Column("batch_item_id", sa.Uuid(), nullable=True),
    )

    conn = op.get_bind()
    runs = conn.execute(
        sa.text(
            """
            SELECT
                id,
                applicant_profile_id,
                job_group_id,
                source_posting_id,
                canonical_application_url,
                application_url,
                platform_adapter_id,
                resume_asset_id,
                resume_sha256,
                applicant_profile_version,
                answer_bank_snapshot,
                answer_bank_hash,
                automation_mode,
                automatic_submission_authorized_at,
                policy_snapshot,
                duplicate_override_reason,
                created_at,
                updated_at
            FROM application_runs
            ORDER BY created_at ASC, id ASC
            """
        )
    ).mappings()

    resume_versions = {
        row["id"]: row["version"]
        for row in conn.execute(
            sa.text("SELECT id, version FROM resume_assets")
        ).mappings()
    }

    for run in runs:
        batch_id = uuid4()
        item_id = uuid4()
        confirmed_at = run["automatic_submission_authorized_at"] or run["created_at"]
        policy = run["policy_snapshot"] or {}
        target_id = None
        raw_target = (
            policy.get("application_target_id") if isinstance(policy, dict) else None
        )
        if isinstance(raw_target, str):
            try:
                target_id = UUID(raw_target)
            except ValueError:
                target_id = None

        resume_version = resume_versions.get(run["resume_asset_id"], 1)
        answer_snapshot = run["answer_bank_snapshot"]
        if not isinstance(answer_snapshot, (dict, list)):
            answer_snapshot = {}

        conn.execute(
            sa.text(
                """
                INSERT INTO application_batches (
                    id,
                    applicant_profile_id,
                    origin,
                    automation_mode,
                    applicant_profile_version,
                    resume_asset_id,
                    resume_asset_version,
                    resume_sha256,
                    answer_bank_snapshot,
                    answer_bank_hash,
                    known_capability_exceptions,
                    policy_revision,
                    confirmation_text_revision,
                    confirmation_text,
                    owner_confirmed_at,
                    created_at,
                    updated_at
                ) VALUES (
                    :id,
                    :applicant_profile_id,
                    'legacy_import',
                    :automation_mode,
                    :applicant_profile_version,
                    :resume_asset_id,
                    :resume_asset_version,
                    :resume_sha256,
                    CAST(:answer_bank_snapshot AS jsonb),
                    :answer_bank_hash,
                    '[]'::jsonb,
                    :policy_revision,
                    :confirmation_text_revision,
                    :confirmation_text,
                    :owner_confirmed_at,
                    :created_at,
                    :updated_at
                )
                """
            ),
            {
                "id": batch_id,
                "applicant_profile_id": run["applicant_profile_id"],
                "automation_mode": run["automation_mode"],
                "applicant_profile_version": run["applicant_profile_version"],
                "resume_asset_id": run["resume_asset_id"],
                "resume_asset_version": resume_version,
                "resume_sha256": run["resume_sha256"],
                "answer_bank_snapshot": json.dumps(answer_snapshot),
                "answer_bank_hash": run["answer_bank_hash"],
                "policy_revision": BATCH_POLICY_REVISION,
                "confirmation_text_revision": BATCH_CONFIRMATION_REVISION,
                "confirmation_text": BATCH_CONFIRMATION_TEXT,
                "owner_confirmed_at": confirmed_at,
                "created_at": run["created_at"],
                "updated_at": run["updated_at"],
            },
        )

        conn.execute(
            sa.text(
                """
                INSERT INTO application_batch_items (
                    id,
                    batch_id,
                    position,
                    job_group_id,
                    application_target_id,
                    source_posting_id,
                    canonical_application_url,
                    application_url,
                    platform_adapter_id,
                    duplicate_override_reason,
                    run_id,
                    created_at
                ) VALUES (
                    :id,
                    :batch_id,
                    0,
                    :job_group_id,
                    :application_target_id,
                    :source_posting_id,
                    :canonical_application_url,
                    :application_url,
                    :platform_adapter_id,
                    :duplicate_override_reason,
                    :run_id,
                    :created_at
                )
                """
            ),
            {
                "id": item_id,
                "batch_id": batch_id,
                "job_group_id": run["job_group_id"],
                "application_target_id": target_id,
                "source_posting_id": run["source_posting_id"],
                "canonical_application_url": run["canonical_application_url"],
                "application_url": run["application_url"],
                "platform_adapter_id": run["platform_adapter_id"],
                "duplicate_override_reason": run["duplicate_override_reason"],
                "run_id": run["id"],
                "created_at": run["created_at"],
            },
        )

        conn.execute(
            sa.text(
                """
                UPDATE application_runs
                SET batch_id = :batch_id, batch_item_id = :batch_item_id
                WHERE id = :run_id
                """
            ),
            {
                "batch_id": batch_id,
                "batch_item_id": item_id,
                "run_id": run["id"],
            },
        )

    op.alter_column("application_runs", "batch_id", nullable=False)
    op.alter_column("application_runs", "batch_item_id", nullable=False)

    op.create_foreign_key(
        "fk_application_runs_batch_id",
        "application_runs",
        "application_batches",
        ["batch_id"],
        ["id"],
        ondelete="RESTRICT",
    )
    op.create_foreign_key(
        "fk_application_runs_batch_item_id",
        "application_runs",
        "application_batch_items",
        ["batch_item_id"],
        ["id"],
        ondelete="RESTRICT",
        deferrable=True,
        initially="DEFERRED",
    )
    op.create_index(
        "uq_application_runs_batch_item_id",
        "application_runs",
        ["batch_item_id"],
        unique=True,
    )
    op.create_index(
        "ix_application_runs_batch_id",
        "application_runs",
        ["batch_id"],
    )

    # Replace job-group uniqueness with profile+URL uniqueness already present;
    # batches may authorize multiple executable targets under one job group.
    op.drop_index(
        "uq_application_runs_active_or_submitted_job_group",
        table_name="application_runs",
    )

    op.create_foreign_key(
        "fk_application_batch_items_run_id",
        "application_batch_items",
        "application_runs",
        ["run_id"],
        ["id"],
        ondelete="RESTRICT",
        deferrable=True,
        initially="DEFERRED",
    )
    op.alter_column("application_batch_items", "run_id", nullable=False)


def downgrade() -> None:
    op.create_index(
        "uq_application_runs_active_or_submitted_job_group",
        "application_runs",
        ["applicant_profile_id", "job_group_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('queued', 'claimed', 'running', 'needs_input', "
            "'paused_auth', 'failed_retryable', 'submitted') "
            "AND duplicate_override_confirmed_at IS NULL"
        ),
    )
    op.drop_constraint(
        "fk_application_batch_items_run_id",
        "application_batch_items",
        type_="foreignkey",
    )
    op.drop_index("ix_application_runs_batch_id", table_name="application_runs")
    op.drop_index("uq_application_runs_batch_item_id", table_name="application_runs")
    op.drop_constraint(
        "fk_application_runs_batch_item_id",
        "application_runs",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_application_runs_batch_id",
        "application_runs",
        type_="foreignkey",
    )
    op.drop_column("application_runs", "batch_item_id")
    op.drop_column("application_runs", "batch_id")
    op.drop_index(
        "ix_application_batch_items_run_id",
        table_name="application_batch_items",
    )
    op.drop_index(
        "ix_application_batch_items_batch_position",
        table_name="application_batch_items",
    )
    op.drop_table("application_batch_items")
    op.drop_index(
        "ix_application_batches_profile_created",
        table_name="application_batches",
    )
    op.drop_table("application_batches")
