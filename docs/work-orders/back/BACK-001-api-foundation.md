# BACK-001: FastAPI Service Foundation

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** CROSS-001

**Unblocks:** BACK-002

**Product spec:** Sections 13 and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Create the minimal typed FastAPI service, backend dependency/test tooling, and database connectivity boundary required by later backend orders. Implement only a health endpoint; do not create the job domain yet.

## Owned files

- `/apps/api/pyproject.toml`
- `/apps/api/uv.lock`
- `/apps/api/package.json`
- `/apps/api/src/job_engine/__init__.py`
- `/apps/api/src/job_engine/main.py`
- `/apps/api/src/job_engine/config.py`
- `/apps/api/src/job_engine/db/__init__.py`
- `/apps/api/src/job_engine/db/session.py`
- `/apps/api/tests/conftest.py`
- `/apps/api/tests/test_health.py`
- `/docs/development.md` (backend commands only)

## Fixed contract

- Import package: `job_engine`; application factory: `create_app()`.
- Workspace wrapper package name: `@job-engine/api`, private and containing scripts only; Python remains the implementation/runtime owner.
- Health route: `GET /api/v1/health` returning `{"status":"ok"}` with HTTP 200.
- Settings class reads `DATABASE_URL`; tests must override configuration without loading a developer's `.env` implicitly.
- SQLAlchemy 2.x async engine/session boundary and PostgreSQL driver are installed now; tables/migrations belong to BACK-002.
- Python runtime constraint: `>=3.13,<3.14`.
- Tooling: uv lockfile, pytest, pytest-asyncio, HTTPX, Ruff, and mypy with strict project-package checking.
- `apps/api/package.json` exposes `dev`, `check`, `test`, and `build` wrappers so root pnpm recursive commands cover the backend. `build` verifies import/package integrity; it does not create a container.

## Procedure

1. Verify CROSS-001 is `DONE` and use its recorded tool versions and environment keys.
2. Create the application package and pin compatible dependency versions in `uv.lock`.
3. Implement typed settings and async engine/session creation without opening a connection during module import.
4. Implement `create_app()` and the fixed health route.
5. Add isolated tests for the response status/body and for application creation when the database is unavailable.
6. Configure Ruff and strict mypy for `src/job_engine` and tests; do not suppress entire error categories.
7. Add package scripts and document exact backend install, dev, check, and test commands.
8. Run all validation with PostgreSQL both stopped and healthy; health must not claim database health.

## Required validation

```bash
cd apps/api && uv sync --frozen
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest
cd apps/api && uv run python -c "from job_engine.main import create_app; create_app()"
corepack pnpm run check
git diff --check
```

## Acceptance criteria

- The service imports and health tests pass without a live database.
- Async database configuration is typed and uses only the documented `DATABASE_URL`.
- Exact dependency versions are locked and no global Python installation is mutated.
- Root recursive checks include the backend wrappers.
- No job schema, source adapter, migration, ingestion, or search behavior is introduced.

## Forbidden decisions

- No synchronous SQLAlchemy session, alternate database, ORM base models, or migrations yet.
- No authentication, CORS wildcard, Dockerfile, background scheduler, task queue, or source dependency.
- No `/jobs` placeholder route or invented API schema.
- No secrets or developer `.env` file.

## Handoff evidence

- Changed-file list and locked dependency summary
- Required-validation transcript
- Health response evidence with PostgreSQL stopped
- Confirmation of zero domain tables/migrations

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `feat/back-001-api-foundation`
- Dispatched at: 2026-08-16T20:13:35-03:00

## Completion record

- Commit: `86f06602d0a82920974ea4c58ba54f8c5e879ef9`
- Evidence: See below
- Independent reviewer: Pending

### Changed-file list

- `apps/api/pyproject.toml`
- `apps/api/uv.lock`
- `apps/api/package.json`
- `apps/api/src/job_engine/__init__.py`
- `apps/api/src/job_engine/main.py`
- `apps/api/src/job_engine/config.py`
- `apps/api/src/job_engine/db/__init__.py`
- `apps/api/src/job_engine/db/session.py`
- `apps/api/tests/conftest.py`
- `apps/api/tests/test_health.py`
- `docs/development.md` (backend commands)
- `pnpm-lock.yaml` (`apps/api` workspace importer only)
- `docs/work-orders/back/BACK-001-api-foundation.md` (status/dispatch/completion)
- `docs/work-orders/back/README.md` (status)
- `docs/work-orders/STATUS.md` (status/dispatch)

No `.env` file was created or committed. Settings never loads `.env`; tests construct `Settings` explicitly.

### Locked dependency summary

Python `>=3.13,<3.14` via uv. Direct runtime: FastAPI `0.141.1`, uvicorn `0.52.3`, SQLAlchemy `2.0.52`, asyncpg `0.31.0`, pydantic `2.13.4`, pydantic-settings `2.15.0`. Direct dev: httpx `0.28.1`, pytest `9.1.1`, pytest-asyncio `1.4.0`, ruff `0.16.3`, mypy `2.3.1`. Exact graph is in `apps/api/uv.lock`. `uv sync --frozen` used the local `.venv` only.

### Required-validation transcript

Postgres was stopped (`docker compose ps` empty) for the first pass, then started (`postgres:17.11`, `127.0.0.1:5432`, `pg_isready` accepting connections) for the second pass.

```text
$ cd apps/api && uv sync --frozen
Checked 39 packages in 0.42ms

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
7 files already formatted

$ cd apps/api && uv run mypy src tests
Success: no issues found in 7 source files

$ cd apps/api && uv run pytest
collected 3 items
tests/test_health.py ...  [100%]
3 passed

$ cd apps/api && uv run python -c "from job_engine.main import create_app; create_app()"
create_app() ok

$ corepack pnpm --filter @job-engine/api run check
All checks passed!
7 files already formatted
Success: no issues found in 7 source files

$ git diff --check
(no whitespace errors)
```

Root `corepack pnpm run check` also attempted a sibling in-progress `@job-engine/web` package from a parallel FRONT-001 session (`next` missing / `node_modules` not installed). That package is outside this order. The owned backend wrapper is covered by `pnpm --filter @job-engine/api run check` and is included in root recursive `--if-present` once `apps/web` is absent.

The same pytest / `create_app()` / health / ruff / mypy / `pnpm --filter @job-engine/api run check` commands passed again with PostgreSQL healthy.

### Health response evidence with PostgreSQL stopped

In-process HTTPX against `create_app()` with Compose Postgres not running:

```text
200 {'status': 'ok'}
```

With PostgreSQL healthy the body remained `{'status': 'ok'}` (process health, not database health).

### Domain tables and migrations

`apps/api/src/job_engine/db/` contains only `__init__.py` and `session.py`. Confirmed absent: `alembic.ini`, `migrations/`, `db/models.py`, `db/base.py`. No `/jobs` route.
