"""Multi-profile applicant data and managed local assets.

Revision ID: 0007_multi_profile_managed_assets
Revises: 0006_full_auto_authorization
Create Date: 2026-08-21
"""

from collections.abc import Sequence
from uuid import uuid4

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0007_multi_profile_assets"
down_revision: str | None = "0006_full_auto_authorization"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # 1. Create installation_state table
    op.create_table(
        "installation_state",
        sa.Column("id", sa.Integer(), primary_key=True, default=1),
        sa.Column(
            "active_profile_id",
            sa.Uuid(),
            sa.ForeignKey("applicant_profiles.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )

    # 2. Create managed_assets table
    op.create_table(
        "managed_assets",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column(
            "profile_id",
            sa.Uuid(),
            sa.ForeignKey("applicant_profiles.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("asset_type", sa.Text(), nullable=False),
        sa.Column("file_name", sa.Text(), nullable=False),
        sa.Column("content_type", sa.Text(), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("relative_path", sa.Text(), nullable=False),
        sa.Column(
            "crop_coordinates",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("extracted_text", sa.Text(), nullable=True),
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
        "ix_managed_assets_profile_type",
        "managed_assets",
        ["profile_id", "asset_type"],
    )
    op.create_index("ix_managed_assets_sha256", "managed_assets", ["sha256"])

    # 3. Add columns to applicant_profiles
    op.add_column(
        "applicant_profiles",
        sa.Column("display_name", sa.Text(), nullable=True),
    )
    op.add_column(
        "applicant_profiles",
        sa.Column(
            "avatar_asset_id",
            sa.Uuid(),
            sa.ForeignKey("managed_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.add_column(
        "applicant_profiles",
        sa.Column(
            "onboarding_step",
            sa.Text(),
            nullable=False,
            server_default="profile",
        ),
    )
    op.add_column(
        "applicant_profiles",
        sa.Column("onboarding_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "applicant_profiles",
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "applicant_profiles",
        sa.Column(
            "automation_preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
    )

    # 4. Add columns to resume_assets
    op.add_column(
        "resume_assets",
        sa.Column("applicant_profile_id", sa.Uuid(), nullable=True),
    )
    op.add_column(
        "resume_assets",
        sa.Column(
            "managed_asset_id",
            sa.Uuid(),
            sa.ForeignKey("managed_assets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.alter_column("resume_assets", "source_markdown_path", nullable=True)
    op.alter_column("resume_assets", "upload_pdf_path", nullable=True)

    # 5. Add columns to reusable_answers
    op.add_column(
        "reusable_answers",
        sa.Column("applicant_profile_id", sa.Uuid(), nullable=True),
    )

    # 6. Add columns to application_runs
    op.add_column(
        "application_runs",
        sa.Column("applicant_profile_id", sa.Uuid(), nullable=True),
    )

    # 7. Deterministic Backfill
    bind = op.get_bind()

    # Check for existing profile
    profile_rows = bind.execute(
        sa.text("SELECT id FROM applicant_profiles ORDER BY created_at ASC")
    ).fetchall()

    target_profile_id: str | None = None
    if profile_rows:
        target_profile_id = str(profile_rows[0][0])
        # Update display_name if not set
        for row in profile_rows:
            p_id = str(row[0])
            fields = bind.execute(
                sa.text(
                    "SELECT field_path, value_payload FROM applicant_profile_fields "
                    "WHERE profile_id = :p_id AND "
                    "field_path IN ('first_name', 'last_name')"
                ),
                {"p_id": p_id},
            ).fetchall()
            first_name = ""
            last_name = ""
            for f_path, payload in fields:
                if f_path == "first_name" and payload:
                    first_name = str(payload).strip("\"'")
                elif f_path == "last_name" and payload:
                    last_name = str(payload).strip("\"'")
            name = f"{first_name} {last_name}".strip()
            display_name = name if name else "Default Applicant"
            bind.execute(
                sa.text(
                    "UPDATE applicant_profiles SET display_name = :display_name "
                    "WHERE id = :p_id AND display_name IS NULL"
                ),
                {"display_name": display_name, "p_id": p_id},
            )
    else:
        # Check if legacy assets/answers/runs exist
        has_assets = bind.execute(
            sa.text("SELECT 1 FROM resume_assets LIMIT 1")
        ).first()
        has_answers = bind.execute(
            sa.text("SELECT 1 FROM reusable_answers LIMIT 1")
        ).first()
        has_runs = bind.execute(
            sa.text("SELECT 1 FROM application_runs LIMIT 1")
        ).first()

        if has_assets or has_answers or has_runs:
            target_profile_id = str(uuid4())
            bind.execute(
                sa.text(
                    "INSERT INTO applicant_profiles ("
                    "  id, display_name, version, created_at, updated_at, "
                    "  onboarding_step, automation_preferences"
                    ") "
                    "VALUES ("
                    "  :id, 'Imported applicant', 1, NOW(), NOW(), "
                    "  'profile', '{}'::jsonb"
                    ")"
                ),
                {"id": target_profile_id},
            )

    if target_profile_id:
        # Set active profile in installation_state
        bind.execute(
            sa.text(
                "INSERT INTO installation_state ("
                "  id, active_profile_id, updated_at"
                ") "
                "VALUES (1, :active_profile_id, NOW()) "
                "ON CONFLICT (id) DO UPDATE "
                "SET active_profile_id = EXCLUDED.active_profile_id"
            ),
            {"active_profile_id": target_profile_id},
        )
        # Backfill resume_assets
        bind.execute(
            sa.text(
                "UPDATE resume_assets SET applicant_profile_id = :target_id "
                "WHERE applicant_profile_id IS NULL"
            ),
            {"target_id": target_profile_id},
        )
        # Backfill reusable_answers
        bind.execute(
            sa.text(
                "UPDATE reusable_answers SET applicant_profile_id = :target_id "
                "WHERE applicant_profile_id IS NULL"
            ),
            {"target_id": target_profile_id},
        )
        # Backfill application_runs
        bind.execute(
            sa.text(
                "UPDATE application_runs SET applicant_profile_id = :target_id "
                "WHERE applicant_profile_id IS NULL"
            ),
            {"target_id": target_profile_id},
        )

    # Set display_name non-null with default
    bind.execute(
        sa.text(
            "UPDATE applicant_profiles SET display_name = 'Default Applicant' "
            "WHERE display_name IS NULL"
        )
    )
    op.alter_column("applicant_profiles", "display_name", nullable=False)

    # Foreign keys and non-null on backfilled tables
    op.alter_column("resume_assets", "applicant_profile_id", nullable=False)
    op.create_foreign_key(
        "fk_resume_assets_applicant_profile_id",
        "resume_assets",
        "applicant_profiles",
        ["applicant_profile_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column("reusable_answers", "applicant_profile_id", nullable=False)
    op.create_foreign_key(
        "fk_reusable_answers_applicant_profile_id",
        "reusable_answers",
        "applicant_profiles",
        ["applicant_profile_id"],
        ["id"],
        ondelete="CASCADE",
    )

    op.alter_column("application_runs", "applicant_profile_id", nullable=False)
    op.create_foreign_key(
        "fk_application_runs_applicant_profile_id",
        "application_runs",
        "applicant_profiles",
        ["applicant_profile_id"],
        ["id"],
        ondelete="CASCADE",
    )

    # 8. Rebuild Scoped Indexes and Constraints
    # resume_assets
    op.drop_constraint("uq_resume_assets_resume_id", "resume_assets", type_="unique")
    op.drop_index("uq_resume_assets_single_default", table_name="resume_assets")
    op.create_unique_constraint(
        "uq_resume_assets_profile_resume_id",
        "resume_assets",
        ["applicant_profile_id", "resume_id"],
    )
    op.create_index(
        "uq_resume_assets_profile_default",
        "resume_assets",
        ["applicant_profile_id", "is_default"],
        unique=True,
        postgresql_where=sa.text("is_default IS TRUE"),
    )

    # reusable_answers
    op.drop_constraint(
        "uq_reusable_answers_answer_id", "reusable_answers", type_="unique"
    )
    op.drop_index("ix_reusable_answers_question_intent", table_name="reusable_answers")
    op.create_unique_constraint(
        "uq_reusable_answers_profile_answer_id",
        "reusable_answers",
        ["applicant_profile_id", "answer_id"],
    )
    op.create_index(
        "ix_reusable_answers_profile_intent",
        "reusable_answers",
        ["applicant_profile_id", "question_intent"],
    )

    # application_runs
    op.drop_index(
        "uq_application_runs_active_or_submitted_url",
        table_name="application_runs",
    )
    op.drop_index(
        "uq_application_runs_active_or_submitted_job_group",
        table_name="application_runs",
    )
    op.create_index(
        "ix_application_runs_profile_status",
        "application_runs",
        ["applicant_profile_id", "status"],
    )
    op.create_index(
        "uq_application_runs_active_or_submitted_url",
        "application_runs",
        ["applicant_profile_id", "canonical_application_url"],
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
        ["applicant_profile_id", "job_group_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('queued', 'claimed', 'running', 'needs_input', "
            "'paused_auth', 'failed_retryable', 'submitted') "
            "AND duplicate_override_confirmed_at IS NULL"
        ),
    )


def downgrade() -> None:
    # application_runs
    op.drop_index(
        "uq_application_runs_active_or_submitted_job_group",
        table_name="application_runs",
    )
    op.drop_index(
        "uq_application_runs_active_or_submitted_url",
        table_name="application_runs",
    )
    op.drop_index(
        "ix_application_runs_profile_status",
        table_name="application_runs",
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
    op.drop_constraint(
        "fk_application_runs_applicant_profile_id",
        "application_runs",
        type_="foreignkey",
    )
    op.drop_column("application_runs", "applicant_profile_id")

    # reusable_answers
    op.drop_index(
        "ix_reusable_answers_profile_intent",
        table_name="reusable_answers",
    )
    op.drop_constraint(
        "uq_reusable_answers_profile_answer_id",
        "reusable_answers",
        type_="unique",
    )
    op.create_index(
        "ix_reusable_answers_question_intent",
        "reusable_answers",
        ["question_intent"],
    )
    op.create_unique_constraint(
        "uq_reusable_answers_answer_id",
        "reusable_answers",
        ["answer_id"],
    )
    op.drop_constraint(
        "fk_reusable_answers_applicant_profile_id",
        "reusable_answers",
        type_="foreignkey",
    )
    op.drop_column("reusable_answers", "applicant_profile_id")

    # resume_assets
    op.drop_index("uq_resume_assets_profile_default", table_name="resume_assets")
    op.drop_constraint(
        "uq_resume_assets_profile_resume_id",
        "resume_assets",
        type_="unique",
    )
    op.create_index(
        "uq_resume_assets_single_default",
        "resume_assets",
        ["is_default"],
        unique=True,
        postgresql_where=sa.text("is_default IS TRUE"),
    )
    op.create_unique_constraint(
        "uq_resume_assets_resume_id",
        "resume_assets",
        ["resume_id"],
    )
    op.drop_constraint(
        "fk_resume_assets_applicant_profile_id",
        "resume_assets",
        type_="foreignkey",
    )
    op.drop_constraint(
        "resume_assets_managed_asset_id_fkey",
        "resume_assets",
        type_="foreignkey",
    )
    op.alter_column("resume_assets", "upload_pdf_path", nullable=False)
    op.alter_column("resume_assets", "source_markdown_path", nullable=False)
    op.drop_column("resume_assets", "managed_asset_id")
    op.drop_column("resume_assets", "applicant_profile_id")

    # applicant_profiles
    op.drop_column("applicant_profiles", "automation_preferences")
    op.drop_column("applicant_profiles", "archived_at")
    op.drop_column("applicant_profiles", "onboarding_completed_at")
    op.drop_column("applicant_profiles", "onboarding_step")
    op.drop_constraint(
        "applicant_profiles_avatar_asset_id_fkey",
        "applicant_profiles",
        type_="foreignkey",
    )
    op.drop_column("applicant_profiles", "avatar_asset_id")
    op.drop_column("applicant_profiles", "display_name")

    # managed_assets
    op.drop_index("ix_managed_assets_sha256", table_name="managed_assets")
    op.drop_index("ix_managed_assets_profile_type", table_name="managed_assets")
    op.drop_table("managed_assets")

    # installation_state
    op.drop_table("installation_state")
