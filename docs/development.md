# Local development

This document covers supported runtimes, environment keys, the local PostgreSQL service, and backend and frontend package commands.

## Exact versions

| Tool | Version |
| --- | --- |
| Node.js | 24.18.0 |
| pnpm | 10.34.5 |
| CPython | 3.13.14 |
| PostgreSQL image | postgres:17.11 |

These pins are also recorded in `.node-version`, `.python-version`, the root `packageManager` field, and `compose.yaml`. Do not use `latest` tags.

## Prerequisites

- Node.js 24.18.0 (`.node-version`; fnm, nvm, or an equivalent version manager)
- pnpm 10.34.5 via Corepack
- CPython 3.13.14 (`.python-version`; uv, pyenv, or an equivalent version manager)
- Docker with Compose v2+

Python dependencies are not installed at the repository root. They are managed with uv inside `apps/api`.

### Corepack on Fedora Node.js packages

Fedora's `nodejs24-bin` package may not ship a `corepack` binary. Install and activate the pinned pnpm version:

```bash
npm install -g corepack
corepack enable
corepack prepare pnpm@10.34.5 --activate
corepack pnpm --version
```

### CPython 3.13.14

If `python3` is a newer line (for example 3.14), install the pinned interpreter without replacing the system Python:

```bash
uv python install 3.13.14
uv python pin 3.13.14
python3 --version
```

`uv python pin` writes `.python-version`, which this repository already contains. Confirm the active `python3` reports `3.13.14` before relying on later backend Work Orders.

## Environment setup

Copy the example file to a local, untracked `.env`:

```bash
cp .env.example .env
```

Then replace the `JOB_ENGINE_RUNNER_SECRET` placeholder with a real value. The
API refuses to start with fewer than 32 characters:

```bash
openssl rand -hex 32
```

`./dev.sh` does this for you when it creates `.env` on first run. The shipped
placeholder is deliberately not a usable secret — never deploy it.

Do not commit `.env`. The example contains only local development placeholders:

| Key | Example value |
| --- | --- |
| `POSTGRES_DB` | `job_engine` |
| `POSTGRES_USER` | `job_engine` |
| `POSTGRES_PASSWORD` | `job_engine` |
| `POSTGRES_PORT` | `5432` |
| `DATABASE_URL` | `postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine` |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` |

`compose.yaml` interpolates the same defaults, so `docker compose` also works before `.env` exists. Copying the example is still the normal local setup step.

## Install the workspace

```bash
corepack pnpm install --frozen-lockfile
```

Root scripts `dev`, `check`, `test`, and `build` run `pnpm recursive --if-present` over `apps/*` and `packages/*`. The backend wrapper package `@job-engine/api` and the frontend package `@job-engine/web` are included automatically. Python dependencies stay in `apps/api` (`uv.lock`); they are not added to the root pnpm lockfile. There is one pnpm lockfile, at the repository root.

```bash
corepack pnpm run check
```

## Database

Compose publishes PostgreSQL only on IPv4 localhost (`127.0.0.1:${POSTGRES_PORT:-5432}`), matching `DATABASE_URL`.

Start only the local PostgreSQL service:

```bash
docker compose up -d postgres
```

Verify the container is healthy:

```bash
docker compose ps
docker compose exec -T postgres pg_isready -U job_engine -d job_engine
```

Stop the service (the named volume `postgres_data` survives):

```bash
docker compose down
```

### Destructive volume reset

The following command deletes the local PostgreSQL volume and all data in it. It is not part of normal startup.

```bash
docker compose down -v
```

Only run this when you intentionally want an empty database on the next `docker compose up -d postgres`.

## Backend (`apps/api`)

Install Python dependencies from the locked uv environment (does not mutate a global Python installation):

```bash
cd apps/api && uv sync --frozen
```

`Settings` reads `DATABASE_URL` from the process environment only. It does not load `.env`. The documented default matches `.env.example`. To apply a local `.env` for the API process, export the variables or pass `--env-file ../../.env` to `uv run`.

Workspace wrappers (also invoked by root `pnpm run check` / `test` / `build` / `dev`):

```bash
corepack pnpm --filter @job-engine/api run dev
corepack pnpm --filter @job-engine/api run check
corepack pnpm --filter @job-engine/api run test
corepack pnpm --filter @job-engine/api run build
```

Equivalent uv commands from `apps/api`:

```bash
uv run uvicorn job_engine.main:create_app --factory --reload --host 127.0.0.1 --port 8000
uv run alembic upgrade head
uv run alembic downgrade base
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
uv run pytest
uv run python -c "from job_engine.main import create_app; create_app()"
```

`dev` serves `GET /api/v1/health` on `http://127.0.0.1:8000`. That route reports process health (`{"status":"ok"}`) and does not query PostgreSQL. `build` verifies that `create_app()` imports; it does not create a container.

Alembic reads `DATABASE_URL` the same way as `Settings` (process environment only, documented default matching `.env.example`). It does not load `.env`. Apply catalog migrations against the local PostgreSQL service after `docker compose up -d postgres`:

```bash
cd apps/api && uv run alembic upgrade head
```

`alembic.ini` does not hardcode credentials. The initial revision `0001_canonical_job_catalog` creates `ingestion_runs`, `job_groups`, `source_postings`, `job_group_postings`, `job_group_technologies`, and `job_group_eligible_locations`.

### AI Answer Providers

The backend supports three answer providers configured via environment variables:

| Variable | Values / Default | Description |
|---|---|---|
| `JOB_ENGINE_ANSWER_PROVIDER` | `deterministic` (default), `local`, `gemini` | Active answering provider. |
| `JOB_ENGINE_LOCAL_PROVIDER_BASE_URL` | `http://127.0.0.1:11434/v1` | Base URL for loopback OpenAI-compatible endpoint (Ollama, vLLM). Must point to loopback (`localhost`, `127.0.0.0/8`, `::1`). |
| `JOB_ENGINE_LOCAL_MODEL` | `None` (e.g. `qwen2.5:7b`, `llama3`) | Model identifier for local provider. |
| `JOB_ENGINE_GEMINI_MODEL` | `gemini-2.5-flash` | Model identifier for Gemini cloud provider. |
| `JOB_ENGINE_GEMINI_API_KEY` | Secret | API key for Gemini cloud provider. Authenticates via `x-goog-api-key` header. |
| `JOB_ENGINE_PROVIDER_PRIVACY_ATTESTATION_ID` | String | Owner attestation ID required for cloud providers (`gemini`). Must match an accepted ID in code. |

- `deterministic`: Offline baseline, zero network requests, always available.
- `local`: Loopback-only for local development and benchmarking. Bypasses `PROVIDER-PRIVACY-001`.
- `gemini`: Cloud model provider. Requires both `JOB_ENGINE_PROVIDER_PRIVACY_ATTESTATION_ID` and `JOB_ENGINE_GEMINI_API_KEY`.
- `openai`: Retired as of 2026-08-20.

See `docs/automation/ai-provider-policy.md` and `docs/evidence/ai-provider-evaluation.md` for the full operational policy and benchmark evidence.

## Frontend (`apps/web`)

`NEXT_PUBLIC_API_BASE_URL` is the public backend origin. It is validated in `apps/web/src/lib/env.ts` and defaults to `http://127.0.0.1:8000` only in local development. Do not put credentials in this variable.

Workspace commands:

```bash
corepack pnpm --filter @job-engine/web run dev
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run test:e2e
corepack pnpm --filter @job-engine/web run build
```

- `dev` serves the App Router application.
- `check` runs `next typegen`, strict `tsc --noEmit`, and ESLint. No separate formatter is installed.
- `test` runs Vitest unit and component tests (`vitest run`).
- `test:e2e` runs Playwright end-to-end and Axe accessibility tests. Scope it to
  one spec by passing the file name, e.g.
  `corepack pnpm --filter @job-engine/web run test:e2e -- jobs.spec.ts`.
  Playwright always starts fresh `:3005` / `:8088` servers; a leftover listener
  from an earlier run would otherwise serve a stale bundle and produce
  misleading "element not found" failures. Set `E2E_REUSE_SERVER=1` to reuse a
  running server only when you know it matches your working tree.
- `build` produces the production Next.js build.

## Desktop (`apps/desktop`)

`JOB_ENGINE_WEB_ORIGIN` is the trusted local web origin (defaults to `http://127.0.0.1:3000`). It must be a loopback address.
`JOB_ENGINE_API_BASE_URL` is the local backend API origin (defaults to `http://127.0.0.1:8000`).
`JOB_ENGINE_DESKTOP_USER_DATA_DIR` optionally overrides the persistent Electron profile directory outside the repository.

Workspace commands:

```bash
corepack pnpm --filter @job-engine/desktop run dev
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/desktop run build
```

- `dev` compiles TypeScript and launches the Electron application shell.
- `check` runs strict `tsc --noEmit` on the desktop package.
- `test` runs Vitest unit tests for main process logic, navigation policy, IPC validation, and bounds clipping.
- `test` runs Vitest unit tests for main-process logic, the browser-neutral form
  layer (under jsdom), and the assisted runtime.
- `test:fixtures` runs the Electron fixture suites: the embedded browser
  lifecycle, the generic assisted-apply matrix, and the mandatory real-backend
  lifecycle. Pass a filter to narrow it, for example
  `run test:fixtures -- generic`.

The fixture suites need PostgreSQL running, because the real-backend lifecycle
fixture creates a throwaway database, migrates it, boots the API, and drops the
database afterwards:

```bash
docker compose up -d postgres
```

That fixture never skips. If PostgreSQL is unreachable it fails, because it is
the acceptance evidence for the assisted-apply runtime. No external model
provider, employer site, or personal data is involved: answers come from the
deterministic provider and every form is synthetic and served from loopback.
- `build` compiles the main and preload TypeScript sources into `dist/`.

## Local CI

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs the same check
scripts as local pre-push validation. Those scripts live under `scripts/`.

```bash
# Normal pre-push validation (preferred)
./scripts/ci.sh
# equivalent:
corepack pnpm run ci
corepack pnpm run ci:local

# Optional full GitHub Actions emulation
act workflow_dispatch -W .github/workflows/ci.yml
```

### Prerequisites

- Docker with Compose v2+ (local CI starts PostgreSQL from `compose.ci.yml`)
- `uv` and CPython 3.13.14 (`.python-version`)
- Node.js 24.18.0 (`.node-version`) and pnpm 10.34.5
- Playwright Chromium: local runs execute `playwright install chromium` only.
  GitHub Actions additionally uses `--with-deps` because `GITHUB_ACTIONS=true`.
- `act` only if you emulate the workflow in Docker

`./scripts/ci.sh` fails if `127.0.0.1:5432` is already bound so it does not
mutate the persistent development volume from `compose.yaml`. Stop the
development database first (`docker compose down`). The CI database uses
`postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine` and is removed
with `docker compose -f compose.ci.yml -p job-engine-ci down -v` unless
`CI_KEEP_POSTGRES=1` is set.

Individual stages can be run the same way GitHub Actions does, after the
matching tools (and, for backend tests, PostgreSQL) are available:

```bash
./scripts/ci-backend-check.sh
./scripts/ci-backend-test.sh
./scripts/ci-frontend-check.sh
./scripts/ci-frontend-test.sh
./scripts/ci-frontend-e2e.sh
```

### `act` limitations

`.actrc` maps `ubuntu-latest` to `catthehacker/ubuntu:act-latest`. Emulation is
a secondary check. Nested PostgreSQL service containers, `actions/upload-artifact`,
and GitHub action caches often fail or behave differently than hosted runners.
Do not weaken `.github/workflows/ci.yml` to paper over those emulator gaps.
