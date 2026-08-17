from collections.abc import AsyncIterator, Iterator
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.config import DOCUMENTED_DATABASE_URL
from job_engine.db.session import create_engine as create_async_engine
from job_engine.db.session import create_session_factory, to_sync_url

API_ROOT = Path(__file__).resolve().parents[2]
ALEMBIC_INI = API_ROOT / "alembic.ini"


def _admin_engine() -> Engine:
    return create_engine(
        to_sync_url(DOCUMENTED_DATABASE_URL),
        isolation_level="AUTOCOMMIT",
    )


@pytest.fixture
def disposable_database_url() -> Iterator[str]:
    db_name = f"job_engine_test_{uuid4().hex[:12]}"
    admin_url = make_url(DOCUMENTED_DATABASE_URL)
    test_url = admin_url.set(database=db_name).render_as_string(hide_password=False)
    engine = _admin_engine()
    try:
        with engine.connect() as connection:
            connection.execute(text(f'CREATE DATABASE "{db_name}"'))
        yield test_url
        with engine.connect() as connection:
            connection.execute(
                text(f'DROP DATABASE IF EXISTS "{db_name}" WITH (FORCE)')
            )
    finally:
        engine.dispose()


def alembic_config(database_url: str) -> Config:
    config = Config(str(ALEMBIC_INI))
    config.set_main_option(
        "sqlalchemy.url",
        to_sync_url(database_url).render_as_string(hide_password=False),
    )
    return config


@pytest.fixture
async def db_session(disposable_database_url: str) -> AsyncIterator[AsyncSession]:
    command.upgrade(alembic_config(disposable_database_url), "head")
    engine = create_async_engine(disposable_database_url)
    factory = create_session_factory(engine)
    async with factory() as session:
        try:
            yield session
        finally:
            await session.rollback()
    await engine.dispose()
