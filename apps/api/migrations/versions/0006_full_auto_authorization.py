"""Add durable full-auto submission authorization.

Revision ID: 0006_full_auto_authorization
Revises: 0005_add_runner_claim_release
Create Date: 2026-08-19
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006_full_auto_authorization"
down_revision: str | None = "0005_add_runner_claim_release"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "application_runs",
        sa.Column(
            "automatic_submission_authorized_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("application_runs", "automatic_submission_authorized_at")
