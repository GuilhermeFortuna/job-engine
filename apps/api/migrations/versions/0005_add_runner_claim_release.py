"""Add runner claim release records and separate retry-failure accounting.

Revision ID: 0005_add_runner_claim_release
Revises: 0004_add_application_runs
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005_add_runner_claim_release"
down_revision: str | None = "0004_add_application_runs"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Separate retry-failure accounting from attempt identity.
    #
    # attempt_count is attempt IDENTITY: evidence lives under
    # runs/{id}/attempt_{n}/ and every event row carries it, so it must stay
    # monotonic. Retry budget therefore moves to its own counter, which only
    # advances when an attempt actually fails.
    op.add_column(
        "application_runs",
        sa.Column(
            "retry_failure_count",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    # Preserve existing rows' effective retry state: before this migration the
    # max_retries check compared attempt_count, and a run under an active claim
    # has already consumed attempt_count - 1 failures.
    op.execute(
        "UPDATE application_runs "
        "SET retry_failure_count = GREATEST(attempt_count - 1, 0)"
    )
    op.alter_column("application_runs", "retry_failure_count", server_default=None)

    # 2. Durable release records authorizing idempotent release-claim replay.
    op.create_table(
        "application_run_lease_releases",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("run_id", sa.Uuid(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("released_lease_token_hash", sa.String(length=64), nullable=False),
        sa.Column("runner_id", sa.Text(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("request_id", sa.Text(), nullable=False),
        sa.Column("superseded_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["run_id"], ["application_runs.id"], ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "run_id",
            "released_lease_token_hash",
            name="uq_application_run_lease_releases_run_token",
        ),
    )
    op.create_index(
        "ix_application_run_lease_releases_run_superseded",
        "application_run_lease_releases",
        ["run_id", "superseded_at"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_application_run_lease_releases_run_superseded",
        table_name="application_run_lease_releases",
    )
    op.drop_table("application_run_lease_releases")
    op.drop_column("application_runs", "retry_failure_count")
