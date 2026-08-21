"""Local-AI self-test and profile proposal persistence.

Revision ID: 0008_local_ai_profile_proposals
Revises: 0007_multi_profile_assets
Create Date: 2026-08-21
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008_local_ai_profile_proposals"
down_revision: str | None = "0007_multi_profile_assets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "local_ai_self_test",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("passed", sa.Boolean(), nullable=True),
        sa.Column("model", sa.Text(), nullable=True),
        sa.Column("schema_revision", sa.Text(), nullable=True),
        sa.Column("prompt_revision", sa.Text(), nullable=True),
        sa.Column("latency_ms", sa.Integer(), nullable=True),
        sa.Column("failure_code", sa.Text(), nullable=True),
        sa.Column("tested_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.CheckConstraint("id = 1", name="ck_local_ai_self_test_singleton"),
    )
    op.execute(
        sa.text("INSERT INTO local_ai_self_test (id, updated_at) VALUES (1, now())")
    )

    op.create_table(
        "local_ai_profile_proposals",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "profile_id",
            sa.Uuid(),
            sa.ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "source_asset_id",
            sa.Uuid(),
            sa.ForeignKey("managed_assets.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("source_asset_sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("schema_revision", sa.Text(), nullable=False),
        sa.Column("prompt_revision", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column(
            "proposal_payload",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
        sa.Column(
            "accepted_field_paths",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("failure_code", sa.Text(), nullable=True),
        sa.Column(
            "deterministic_extraction_ok",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("true"),
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
        "ix_local_ai_profile_proposals_profile",
        "local_ai_profile_proposals",
        ["profile_id", "created_at"],
    )
    op.create_index(
        "ix_local_ai_profile_proposals_asset",
        "local_ai_profile_proposals",
        ["source_asset_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_local_ai_profile_proposals_asset",
        table_name="local_ai_profile_proposals",
    )
    op.drop_index(
        "ix_local_ai_profile_proposals_profile",
        table_name="local_ai_profile_proposals",
    )
    op.drop_table("local_ai_profile_proposals")
    op.drop_table("local_ai_self_test")
