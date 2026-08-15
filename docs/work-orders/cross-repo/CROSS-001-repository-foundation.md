# CROSS-001: Repository and Local-Development Foundation

**Status:** `REVIEW`

**Owner:** Unassigned

**Depends on:** None

**Unblocks:** BACK-001, FRONT-001

**Product spec:** Sections 13, 15, 17, and 18 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Create a reproducible monorepo root and local PostgreSQL environment without implementing backend or frontend product features.

## Owned files

- `/README.md`
- `/.gitignore`
- `/.env.example`
- `/.node-version`
- `/.python-version`
- `/package.json`
- `/pnpm-workspace.yaml`
- `/pnpm-lock.yaml`
- `/compose.yaml`
- `/docs/development.md`

No other files may be added or modified by this order except its status/dispatch records.

## Fixed decisions

- Root package: private package named `job-engine`; package manager is pnpm, pinned through the root `packageManager` field and lockfile.
- JavaScript runtime line: Node.js 24.
- Python runtime line: CPython 3.13; Python dependencies will be managed inside `apps/api` by BACK-001.
- Database: one local PostgreSQL 17 service exposed only for local development.
- Repository layout reserved by workspace globs: `apps/*` and `packages/*`.
- Environment keys: `POSTGRES_DB=job_engine`, `POSTGRES_USER=job_engine`, `POSTGRES_PASSWORD`, `POSTGRES_PORT=5432`, and `DATABASE_URL`.

The worker must record the exact Node, pnpm, Python, and PostgreSQL patch versions used in `docs/development.md`; lockfiles and version files must not use `latest`.

## Procedure

1. Confirm the worktree contains only the current documentation baseline and preserve unrelated changes.
2. Add root runtime/version files and a private-by-default `.gitignore` covering `.env`, virtual environments, caches, coverage, build output, and IDE/OS noise without ignoring committed fixtures.
3. Add `.env.example` with non-secret local defaults. Do not create or commit `.env`.
4. Add a private root `package.json` with the pinned pnpm version. Root scripts named `dev`, `check`, `test`, and `build` must use pnpm recursive `--if-present` execution over workspace packages, with parallel execution only for `dev`. They must exit successfully while no application packages exist and automatically include later app-package scripts without another root edit.
5. Add `pnpm-workspace.yaml` for `apps/*` and `packages/*`; generate the lockfile without application dependencies.
6. Add `compose.yaml` containing only PostgreSQL, a named volume, a health check, and environment interpolation. Do not add API or web containers.
7. Write `README.md` with the V1 purpose, links to the context/spec/Work Order registry, and foundation-stage startup guidance.
8. Write `docs/development.md` with prerequisites, exact versions, environment setup, database start/stop commands, health verification, and safe volume-reset instructions. A destructive volume reset must be clearly labeled and must not be part of normal startup.
9. Run the validation commands and attach their output to the handoff.

## Required validation

```bash
corepack pnpm --version
node --version
python3 --version
corepack pnpm install --frozen-lockfile
docker compose config
docker compose up -d postgres
docker compose ps
docker compose exec -T postgres pg_isready -U job_engine -d job_engine
corepack pnpm run check
docker compose down
git diff --check
```

## Acceptance criteria

- A clean clone can install the empty workspace and start a healthy PostgreSQL service using only documented commands.
- No secret is committed, and `.env.example` contains only safe development placeholders.
- Runtime and package-manager patch versions are explicit and internally consistent.
- Root scripts are present, succeed against the empty foundation, and are already capable of invoking later workspace-package scripts.
- The database volume survives normal `docker compose down` and is removed only by the separately documented destructive command.
- No backend/frontend application skeleton or product behavior is introduced.

## Forbidden decisions

- Do not add Turborepo, Nx, Kubernetes, a message broker, a vector database, or cloud infrastructure.
- Do not containerize the API or frontend.
- Do not add production deployment configuration.
- Do not add job-source credentials or source-specific code.
- Do not mark BACK-001 or FRONT-001 complete as part of this order.

## Handoff evidence

- Changed-file list
- Exact runtime/tool versions
- Required-validation transcript
- `docker compose ps` health evidence
- Confirmation that no `.env` or credential was committed

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `feat/cross-001-repository-foundation`
- Dispatched at: 2026-08-15T19:54:00-03:00

## Completion record

- Commit: `5a464cbdf9a4254cbd373ee8fef1431bdd08833d`
- Evidence: See below
- Independent reviewer: Pending

### Changed-file list

- `README.md`
- `.gitignore`
- `.env.example`
- `.node-version`
- `.python-version`
- `package.json`
- `pnpm-workspace.yaml`
- `pnpm-lock.yaml`
- `compose.yaml`
- `docs/development.md`
- `docs/work-orders/cross-repo/CROSS-001-repository-foundation.md` (status/dispatch/completion)
- `docs/work-orders/STATUS.md` (status/dispatch)
- `docs/work-orders/cross-repo/README.md` (status)

No `.env` file was created or committed. `.env.example` contains only local development placeholders.

### Exact runtime/tool versions

- Node.js `v24.18.0`
- pnpm `10.34.5` (`packageManager` field and Corepack)
- CPython `3.13.14` (`.python-version`; `uv python install 3.13.14`)
- PostgreSQL image `postgres:17.11`

### Required-validation transcript

```text
$ corepack pnpm --version
10.34.5

$ node --version
v24.18.0

$ python3 --version
Python 3.13.14

$ corepack pnpm install --frozen-lockfile
Already up to date
Done in 240ms using pnpm v10.34.5

$ docker compose config
name: job-engine
services:
  postgres:
    environment:
      POSTGRES_DB: job_engine
      POSTGRES_PASSWORD: job_engine
      POSTGRES_USER: job_engine
    healthcheck:
      test:
        - CMD-SHELL
        - pg_isready -U "$$POSTGRES_USER" -d "$$POSTGRES_DB"
      timeout: 5s
      interval: 5s
      retries: 10
      start_period: 10s
    image: postgres:17.11
    ports:
      - published: "5432"
        target: 5432
    volumes:
      - source: postgres_data
        target: /var/lib/postgresql/data
volumes:
  postgres_data:
    name: job-engine_postgres_data

$ docker compose up -d postgres
Image postgres:17.11 Pulled
Volume job-engine_postgres_data Created
Container job-engine-postgres-1 Started

$ docker compose ps
NAME                    IMAGE            COMMAND                  SERVICE    CREATED         STATUS                   PORTS
job-engine-postgres-1   postgres:17.11   "docker-entrypoint.s…"   postgres   8 seconds ago   Up 6 seconds (healthy)   0.0.0.0:5432->5432/tcp, [::]:5432->5432/tcp

$ docker compose exec -T postgres pg_isready -U job_engine -d job_engine
/var/run/postgresql:5432 - accepting connections

$ corepack pnpm run check
> job-engine@ check /home/gui/projects/job-engine
> pnpm recursive --if-present run check
No projects matched the filters in "/home/gui/projects/job-engine"

$ docker compose down
Container job-engine-postgres-1 Removed
Network job-engine_default Removed

$ docker volume ls --filter name=postgres_data
local     job-engine_postgres_data

$ git diff --check
(no whitespace errors)

$ git status --short
(no .env; only owned foundation files and status/dispatch records)
```

### Health evidence

`docker compose ps` reported `Up 6 seconds (healthy)` for `postgres:17.11`. `pg_isready -U job_engine -d job_engine` reported `accepting connections`. After `docker compose down` (without `-v`), named volume `job-engine_postgres_data` remained.

### Secrets confirmation

No `.env` file exists in the worktree. No credential beyond the documented local placeholder `job_engine` appears in committed files. `.gitignore` ignores `.env`.
