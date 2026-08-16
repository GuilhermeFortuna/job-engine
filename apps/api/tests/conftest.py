from collections.abc import AsyncIterator

import pytest
from fastapi import FastAPI
from httpx import ASGITransport, AsyncClient

from job_engine.config import Settings
from job_engine.main import create_app

UNREACHABLE_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:1/job_engine"


@pytest.fixture
def settings() -> Settings:
    return Settings(database_url=UNREACHABLE_DATABASE_URL)


@pytest.fixture
def app(settings: Settings) -> FastAPI:
    return create_app(settings)


@pytest.fixture
async def client(app: FastAPI) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as http_client:
        yield http_client
