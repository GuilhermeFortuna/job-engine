from collections.abc import AsyncIterator

import pytest
from alembic import command
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from job_engine.config import Settings
from job_engine.main import create_app
from tests.db.conftest import alembic_config, disposable_database_url

__all__ = ["app", "client", "disposable_database_url", "session"]


@pytest.fixture
async def app(disposable_database_url: str) -> AsyncIterator[FastAPI]:
    command.upgrade(alembic_config(disposable_database_url), "head")
    application = create_app(
        Settings(
            database_url=disposable_database_url,
            runner_secret="test-runner-secret-at-least-thirty-two-characters",
        )
    )
    try:
        yield application
    finally:
        await application.state.engine.dispose()


@pytest.fixture
async def session(app: FastAPI) -> AsyncIterator[AsyncSession]:
    async with app.state.session_factory() as db_session:
        try:
            yield db_session
            await db_session.commit()
        except Exception:
            await db_session.rollback()
            raise


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(
        transport=transport,
        base_url="http://test",
        headers={"Origin": "http://localhost:3000"},
    ) as http_client:
        yield http_client
