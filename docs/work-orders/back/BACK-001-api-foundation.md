# BACK-001: FastAPI Service Foundation

**Status:** `BLOCKED`

**Owner:** Unassigned

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

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
