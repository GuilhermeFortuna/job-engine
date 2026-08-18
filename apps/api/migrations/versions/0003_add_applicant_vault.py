"""Applicant data vault, resume assets catalog, and reusable answer bank.

Revision ID: 0003_add_applicant_vault
Revises: 0002_normalization_identity
Create Date: 2026-08-18
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0003_add_applicant_vault"
down_revision: str | None = "0002_normalization_identity"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "applicant_profiles",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
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
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "applicant_profile_fields",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("profile_id", sa.Uuid(), nullable=False),
        sa.Column("field_path", sa.Text(), nullable=False),
        sa.Column("value_state", sa.Text(), nullable=False),
        sa.Column(
            "value_payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True
        ),
        sa.Column("source", sa.Text(), nullable=True),
        sa.Column("last_confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("policy_category", sa.Text(), nullable=False),
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
        sa.ForeignKeyConstraint(
            ["profile_id"],
            ["applicant_profiles.id"],
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "profile_id", "field_path", name="uq_applicant_profile_fields_path"
        ),
    )
    op.create_index(
        "ix_applicant_profile_fields_profile_path",
        "applicant_profile_fields",
        ["profile_id", "field_path"],
    )

    op.create_table(
        "resume_assets",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("resume_id", sa.Text(), nullable=False),
        sa.Column("label", sa.Text(), nullable=False),
        sa.Column("source_markdown_path", sa.Text(), nullable=False),
        sa.Column("upload_pdf_path", sa.Text(), nullable=False),
        sa.Column("preview_html_path", sa.Text(), nullable=True),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("language", sa.Text(), nullable=False, server_default="en"),
        sa.Column(
            "is_default", sa.Boolean(), nullable=False, server_default=sa.text("false")
        ),
        sa.Column("file_size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("last_verified_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("resume_id", name="uq_resume_assets_resume_id"),
    )
    op.create_index(
        "uq_resume_assets_single_default",
        "resume_assets",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default IS TRUE"),
    )

    op.create_table(
        "reusable_answers",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("answer_id", sa.Text(), nullable=False),
        sa.Column("question_intent", sa.Text(), nullable=False),
        sa.Column("jurisdiction", sa.Text(), nullable=True),
        sa.Column("platform_scope", sa.Text(), nullable=True),
        sa.Column("answer_text", sa.Text(), nullable=False),
        sa.Column("policy_category", sa.Text(), nullable=False),
        sa.Column(
            "provenance", sa.Text(), nullable=False, server_default="owner_authored"
        ),
        sa.Column("last_confirmed_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default=sa.text("1")),
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
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("answer_id", name="uq_reusable_answers_answer_id"),
    )
    op.create_index(
        "ix_reusable_answers_question_intent",
        "reusable_answers",
        ["question_intent"],
    )


def downgrade() -> None:
    op.drop_index("ix_reusable_answers_question_intent", table_name="reusable_answers")
    op.drop_table("reusable_answers")
    op.drop_index("uq_resume_assets_single_default", table_name="resume_assets")
    op.drop_table("resume_assets")
    op.drop_index(
        "ix_applicant_profile_fields_profile_path",
        table_name="applicant_profile_fields",
    )
    op.drop_table("applicant_profile_fields")
    op.drop_table("applicant_profiles")
