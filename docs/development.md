# Local development

This document covers supported runtimes, environment keys, the local PostgreSQL service, and frontend package commands. The backend application package is added by `BACK-001`.

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

Python dependencies are not installed at the repository root. `BACK-001` will manage them inside `apps/api`.

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

Root scripts `dev`, `check`, `test`, and `build` run `pnpm recursive --if-present` over `apps/*` and `packages/*`. The frontend package `@job-engine/web` is included automatically. There is one lockfile, at the repository root.

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

## Frontend (`apps/web`)

`NEXT_PUBLIC_API_BASE_URL` is the public backend origin. It is validated in `apps/web/src/lib/env.ts` and defaults to `http://127.0.0.1:8000` only in local development. Do not put credentials in this variable.

Workspace commands:

```bash
corepack pnpm --filter @job-engine/web run dev
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run build
```

- `dev` serves the App Router foundation page (not a live job catalog).
- `check` runs `next typegen`, strict `tsc --noEmit`, and ESLint. No separate formatter is installed.
- `test` runs Vitest once (`vitest run`).
- `build` produces the production Next.js build.

The foundation page does not call the API. Later UI orders will read `getApiBaseUrl()` from `src/lib/env.ts`.
