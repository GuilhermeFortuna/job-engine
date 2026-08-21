"""Executable application targets and listing URL rename.

Revision ID: 0009_executable_targets
Revises: 0008_local_ai_profile_proposals
Create Date: 2026-08-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0009_executable_targets"
down_revision: str | None = "0008_local_ai_profile_proposals"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

application_target_status = postgresql.ENUM(
    "executable",
    "assisted",
    "external",
    "unresolved",
    name="application_target_status",
    create_type=False,
)


def upgrade() -> None:
    op.alter_column(
        "source_postings",
        "application_url",
        new_column_name="listing_url",
    )
    op.alter_column(
        "source_postings",
        "application_url_canonical",
        new_column_name="listing_url_canonical",
    )
    op.drop_index(
        "ix_source_postings_application_url_canonical",
        table_name="source_postings",
    )
    op.create_index(
        "ix_source_postings_listing_url_canonical",
        "source_postings",
        ["listing_url_canonical"],
    )

    application_target_status.create(op.get_bind(), checkfirst=False)
    op.create_table(
        "application_targets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "source_posting_id",
            sa.Uuid(),
            sa.ForeignKey("source_postings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("target_url", sa.Text(), nullable=False),
        sa.Column("target_url_canonical", sa.Text(), nullable=False),
        sa.Column("provider", sa.Text(), nullable=True),
        sa.Column("desktop_adapter_id", sa.Text(), nullable=True),
        sa.Column(
            "status",
            application_target_status,
            nullable=False,
        ),
        sa.Column("resolution_method", sa.Text(), nullable=False),
        sa.Column(
            "evidence",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column("verified_at", sa.DateTime(timezone=True), nullable=True),
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
        sa.UniqueConstraint(
            "source_posting_id",
            name="uq_application_targets_source_posting_id",
        ),
    )
    op.create_index(
        "ix_application_targets_target_url_canonical",
        "application_targets",
        ["target_url_canonical"],
    )
    op.create_index(
        "ix_application_targets_status",
        "application_targets",
        ["status"],
    )


def downgrade() -> None:
    op.drop_index("ix_application_targets_status", table_name="application_targets")
    op.drop_index(
        "ix_application_targets_target_url_canonical",
        table_name="application_targets",
    )
    op.drop_table("application_targets")
    application_target_status.drop(op.get_bind(), checkfirst=False)

    op.drop_index(
        "ix_source_postings_listing_url_canonical",
        table_name="source_postings",
    )
    op.alter_column(
        "source_postings",
        "listing_url",
        new_column_name="application_url",
    )
    op.alter_column(
        "source_postings",
        "listing_url_canonical",
        new_column_name="application_url_canonical",
    )
    op.create_index(
        "ix_source_postings_application_url_canonical",
        "source_postings",
        ["application_url_canonical"],
    )
