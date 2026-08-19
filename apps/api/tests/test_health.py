from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from pytest import MonkeyPatch

from job_engine.config import Settings
from job_engine.main import create_app

DOCUMENTED_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine"
UNREACHABLE_DATABASE_URL = "postgresql://job_engine:job_engine@127.0.0.1:1/job_engine"


async def test_health_returns_ok_status_and_body(client: AsyncClient) -> None:
    response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_create_app_succeeds_when_database_is_unavailable() -> None:
    settings = Settings(
        database_url=UNREACHABLE_DATABASE_URL,
        runner_secret="test-runner-secret-at-least-thirty-two-characters",
    )
    app = create_app(settings)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_create_app_rejects_missing_runner_secret() -> None:
    with pytest.raises(ValueError, match="JOB_ENGINE_RUNNER_SECRET"):
        create_app(Settings(database_url=UNREACHABLE_DATABASE_URL))


def test_settings_ignores_dotenv_file(tmp_path: Path, monkeypatch: MonkeyPatch) -> None:
    monkeypatch.chdir(tmp_path)
    monkeypatch.delenv("DATABASE_URL", raising=False)
    (tmp_path / ".env").write_text(
        "DATABASE_URL=postgresql://from-file:from-file@127.0.0.1:5432/from_file\n",
        encoding="utf-8",
    )

    settings = Settings()

    assert settings.database_url == DOCUMENTED_DATABASE_URL
