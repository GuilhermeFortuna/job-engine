from alembic import command
from sqlalchemy import create_engine, inspect, text

from job_engine.db.session import to_sync_url
from tests.db.conftest import alembic_config

REQUIRED_TABLES = {
    "alembic_version",
    "ingestion_runs",
    "job_groups",
    "job_group_postings",
    "job_group_technologies",
    "job_group_eligible_locations",
    "job_group_role_families",
    "source_postings",
    "application_targets",
    "application_batches",
    "application_batch_items",
    "application_runs",
}

REQUIRED_ENUMS = {
    "remote_status",
    "employment_type",
    "seniority",
    "job_status",
    "ingestion_run_status",
}


def test_migration_upgrade_downgrade_upgrade_round_trip(
    disposable_database_url: str,
) -> None:
    config = alembic_config(disposable_database_url)

    command.upgrade(config, "head")
    command.downgrade(config, "base")
    command.upgrade(config, "head")

    engine = create_engine(to_sync_url(disposable_database_url))
    try:
        inspector = inspect(engine)
        assert REQUIRED_TABLES <= set(inspector.get_table_names())

        unique_source_identity = False
        for constraint in inspector.get_unique_constraints("source_postings"):
            if set(constraint["column_names"]) == {"source_id", "source_posting_id"}:
                unique_source_identity = True
        for index in inspector.get_indexes("source_postings"):
            if index.get("unique") and set(index["column_names"]) == {
                "source_id",
                "source_posting_id",
            }:
                unique_source_identity = True
        assert unique_source_identity

        compensation_columns = {
            column["name"]: column
            for column in inspector.get_columns("job_groups")
            if column["name"].startswith("compensation_")
        }
        for name in (
            "compensation_minimum",
            "compensation_maximum",
            "compensation_annual_usd_minimum",
            "compensation_annual_usd_maximum",
        ):
            assert compensation_columns[name]["nullable"] is True
            assert compensation_columns[name]["default"] is None

        with engine.connect() as connection:
            enum_names = {
                row[0]
                for row in connection.execute(
                    text("SELECT typname FROM pg_type WHERE typtype = 'e'")
                )
            }
        assert REQUIRED_ENUMS <= enum_names

        posting_columns = {
            column["name"] for column in inspector.get_columns("source_postings")
        }
        assert "listing_url" in posting_columns
        assert "listing_url_canonical" in posting_columns
        assert "application_url" not in posting_columns
        assert "application_url_canonical" not in posting_columns

        target_columns = {
            column["name"] for column in inspector.get_columns("application_targets")
        }
        assert {
            "id",
            "source_posting_id",
            "target_url",
            "target_url_canonical",
            "provider",
            "desktop_adapter_id",
            "status",
            "resolution_method",
            "evidence",
            "verified_at",
        } <= target_columns

        run_columns = {
            column["name"] for column in inspector.get_columns("application_runs")
        }
        assert "application_url" in run_columns
        assert "canonical_application_url" in run_columns
        assert "batch_id" in run_columns
        assert "batch_item_id" in run_columns

        batch_columns = {
            column["name"] for column in inspector.get_columns("application_batches")
        }
        assert {
            "id",
            "applicant_profile_id",
            "origin",
            "automation_mode",
            "resume_sha256",
            "answer_bank_hash",
            "confirmation_text_revision",
            "owner_confirmed_at",
        } <= batch_columns

        item_columns = {
            column["name"]
            for column in inspector.get_columns("application_batch_items")
        }
        assert {
            "id",
            "batch_id",
            "position",
            "run_id",
            "job_group_id",
            "canonical_application_url",
        } <= item_columns
    finally:
        engine.dispose()
