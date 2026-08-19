from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool

from job_engine.config import Settings
from job_engine.db.base import Base
from job_engine.db.models import (  # noqa: F401
    IngestionRun,
    JobGroup,
    JobGroupEligibleLocation,
    JobGroupPosting,
    JobGroupRoleFamily,
    JobGroupTechnology,
    SourcePosting,
)
from job_engine.db.session import to_sync_url

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def _database_url() -> str:
    configured = config.get_main_option("sqlalchemy.url")
    raw_url = configured if configured else Settings().database_url
    return to_sync_url(raw_url).render_as_string(hide_password=False)


def run_migrations_offline() -> None:
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = _database_url()
    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
