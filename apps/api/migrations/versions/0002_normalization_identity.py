"""Normalization identity keys and role-family membership.

Revision ID: 0002_normalization_identity
Revises: 0001_canonical_job_catalog
Create Date: 2026-08-16
"""

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002_normalization_identity"
down_revision: str | None = "0001_canonical_job_catalog"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "source_postings",
        sa.Column("application_url_canonical", sa.Text(), nullable=True),
    )
    op.execute("UPDATE source_postings SET application_url_canonical = application_url")
    op.alter_column("source_postings", "application_url_canonical", nullable=False)
    op.create_index(
        "ix_source_postings_application_url_canonical",
        "source_postings",
        ["application_url_canonical"],
    )

    op.add_column(
        "job_groups",
        sa.Column("title_comparison_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "job_groups",
        sa.Column("company_comparison_key", sa.Text(), nullable=True),
    )
    op.add_column(
        "job_groups",
        sa.Column("location_comparison_key", sa.Text(), nullable=True),
    )
    op.execute(
        """
        UPDATE job_groups
        SET title_comparison_key = lower(title),
            company_comparison_key = lower(company),
            location_comparison_key = coalesce(lower(location_original), '')
        """
    )
    op.alter_column("job_groups", "title_comparison_key", nullable=False)
    op.alter_column("job_groups", "company_comparison_key", nullable=False)
    op.alter_column("job_groups", "location_comparison_key", nullable=False)
    op.create_index(
        "ix_job_groups_identity_tuple",
        "job_groups",
        [
            "company_comparison_key",
            "title_comparison_key",
            "location_comparison_key",
        ],
    )

    op.create_table(
        "job_group_role_families",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_group_id", sa.Uuid(), nullable=False),
        sa.Column("family_id", sa.Text(), nullable=False),
        sa.ForeignKeyConstraint(["job_group_id"], ["job_groups.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "job_group_id", "family_id", name="uq_job_group_role_families_family"
        ),
    )


def downgrade() -> None:
    op.drop_table("job_group_role_families")
    op.drop_index("ix_job_groups_identity_tuple", table_name="job_groups")
    op.drop_column("job_groups", "location_comparison_key")
    op.drop_column("job_groups", "company_comparison_key")
    op.drop_column("job_groups", "title_comparison_key")
    op.drop_index(
        "ix_source_postings_application_url_canonical", table_name="source_postings"
    )
    op.drop_column("source_postings", "application_url_canonical")
