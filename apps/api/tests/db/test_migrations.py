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
    "source_postings",
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
    finally:
        engine.dispose()
