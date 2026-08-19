# Job Engine

<p align="center">
  <strong>Personal Job-Search Intelligence Engine & Embedded Assisted-Apply Workspace for International Remote Software Engineering</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.18.0-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 24.18.0" />
  <img src="https://img.shields.io/badge/pnpm-10.34.5-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm 10.34.5" />
  <img src="https://img.shields.io/badge/Python-3.13.14-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.13.14" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16.3-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/Electron-43.2.0-47848F?style=flat-square&logo=electron&logoColor=white" alt="Electron 43.2" />
  <img src="https://img.shields.io/badge/PostgreSQL-17.11-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17" />
  <img src="https://img.shields.io/github/actions/workflow/status/GuilhermeFortuna/job-engine/ci.yml?branch=main&label=CI&style=flat-square" alt="CI Status" />
  <img src="https://img.shields.io/badge/License-Private-grey?style=flat-square" alt="Private License" />
</p>

---

## 🎯 Overview

**Job Engine** is a high-signal, personal job-search engine and embedded application assistant purpose-built for international remote software engineering. It aggregates positions from approved public feeds, normalizes unstructured metadata, eliminates duplicate postings across boards, indexes verified remote eligibility, and provides a sandboxed desktop workspace for assisted job applications.

### The Problem It Solves

Finding genuine international remote engineering roles from Brazil or Latin America typically involves jumping between fragmented job boards, wading through misleading "remote" listings restricted to US time zones or US work authorization, and manually re-entering profile information across dozens of employer application portals.

Job Engine solves this by providing:

1. **Deterministic Aggregation & Live Sync:** Ingests postings from approved, legally compliant feeds ([Himalayas](https://himalayas.app), [Jobicy](https://jobicy.com), and [Remote OK](https://remoteok.com)) with on-demand concurrent live search and Server-Sent Events (SSE) progress streaming.
2. **Canonical Normalization & Deduplication:** Standardizes role families, technology aliases, seniority levels, compensation ranges, and cross-source duplicates into unified **Job Groups**.
3. **Geographic Remote Validation:** Classifies geographic eligibility with high precision (`BRAZIL`, `LATAM`, `WORLDWIDE`, or `UNKNOWN`).
4. **Applicant Data Vault & Grounded Answering:** Securely manages applicant profile data, answer banks, local PDF resumes, and grounded 6-category policy-driven answer resolutions.
5. **Embedded Assisted-Apply Desktop Workspace:** Embeds live Applicant Tracking System (ATS) application forms (Greenhouse, Lever) inside a secure Electron shell (`WebContentsView`), auto-filling verified fields while enforcing an explicit owner review and release gate before final submission.
6. **Provenance & Zero-Hallucination Integrity:** Full raw upstream auditability, honest unknown states, zero speculative AI hallucinations, and strict refusal to bypass CAPTCHAs, bot controls, or access policies.

---

## 🏗 Architecture & Pipeline

```mermaid
flowchart TD
    subgraph Ingestion["1. Multi-Source Ingestion & Live Sync"]
        S1[Himalayas API] --> A1[Himalayas Adapter]
        S2[Jobicy API] --> A2[Jobicy Adapter]
        S3[Remote OK Feed] --> A3[Remote OK Adapter]
        Sync[Live Sync Engine\nSSE Streaming API] --> A1 & A2 & A3
    end

    subgraph Processing["2. Normalization & Deduplication"]
        A1 & A2 & A3 --> N[Normalization Engine\nTaxonomies & Geo Rules]
        N -->|Role Family, Tech, Geo, Salary| D[Deduplication Service]
        D -->|Fingerprinting & Similarity| M[Canonical Job Groups]
    end

    subgraph Storage["3. Persistence & State Machine"]
        M --> DB[(PostgreSQL 17\nCatalog, Leases, Runs & Audit)]
    end

    subgraph Vault["4. Applicant Vault & Answering Engine"]
        VaultData[Profile & Answer Bank] --> AnswerEngine[Grounded Answering Engine\n6-Category Policy & Provenance]
        ResumeStore[Local Resume Catalog\nPDF Hashes & Single-Use Grants] --> AnswerEngine
    end

    subgraph Serving["5. Applications & Serving"]
        DB --> API[FastAPI Backend\nREST + SSE Streams]
        AnswerEngine <--> API
        API --> Web[Next.js 16 Web Dashboard\nSearch, Filters & Workspace UI]
        Web <-->|Trusted IPC| Desktop[Electron 43.2 Desktop Shell\nWebContentsView Sandbox]
        Desktop -->|Assisted Apply Runtime| ATS[Greenhouse & Lever ATS Pages]
    end
```

---

## 🚀 Tech Stack

| Layer | Technology | Details |
| --- | --- | --- |
| **Monorepo** | pnpm 10.34.5 | Workspace orchestrator for frontend, backend, and desktop packages |
| **Backend API** | Python 3.13.14, FastAPI, uv, Uvicorn | High-performance asynchronous REST & SSE backend (`apps/api`) |
| **Desktop Shell** | Electron 43.2.0, TypeScript | Secure desktop application with isolated `WebContentsView` (`apps/desktop`) |
| **Frontend Web** | Next.js 16.3 (App Router), React 19, TypeScript | Server & Client components, Tailwind CSS 4, Motion, Lucide icons (`apps/web`) |
| **Data Validation** | Pydantic v2 (Python), Zod (TypeScript) | Strictly typed, frozen canonical schemas and domain models |
| **ORM & Migrations** | SQLAlchemy 2.0 (async), Alembic | Fully typed async queries via `asyncpg` and declarative schema migrations |
| **Database** | PostgreSQL 17.11 | Relational catalog, application state machine, and audit logs |
| **Testing & Quality** | Pytest, Vitest, Playwright 1.62, Ruff, Mypy, ESLint | Unit, integration, E2E fixtures, accessibility (Axe), and strict linting |
| **Infrastructure** | Docker & Compose v2+ | Containerized local PostgreSQL with health checks |

---

## 📁 Repository Structure

```text
job-engine/
├── apps/
│   ├── api/                     # FastAPI backend service
│   │   ├── alembic.ini          # Database migration configuration
│   │   ├── migrations/          # Alembic schema version scripts
│   │   ├── pyproject.toml       # Python dependencies (uv-managed)
│   │   ├── src/job_engine/      # Application source code
│   │   │   ├── api/             # HTTP routes (jobs, sync, applicant, runs, catalog)
│   │   │   ├── config.py        # Environment settings (Pydantic Settings)
│   │   │   ├── data/            # Canonical taxonomies & alias mappings (JSON)
│   │   │   ├── db/              # SQLAlchemy models, sessions & repositories
│   │   │   ├── domain/          # Domain entities, enums, schemas & answer policy
│   │   │   ├── main.py          # FastAPI application factory & CSRF protection
│   │   │   └── services/        # Ingestion, normalization, live sync & answering
│   │   └── tests/               # Pytest suite (unit, db integration, services)
│   ├── desktop/                 # Electron 43.2 desktop shell & assisted apply runtime
│   │   ├── package.json         # Desktop package configuration
│   │   ├── src/main/            # Electron main process, IPC, navigation policy & ATS adapters
│   │   ├── src/preload/         # Trusted typed preload bridge for Web UI
│   │   └── tests/               # Unit tests and synthetic Electron fixture runners
│   └── web/                     # Next.js 16 frontend application
│       ├── package.json         # Frontend dependencies & scripts
│       ├── src/app/             # App Router pages (/jobs, /applications, /workspace)
│       ├── src/components/      # UI component library, modals & layout controls
│       ├── src/lib/             # Environment validation, API client & query hooks
│       └── tests/               # Vitest component tests & Playwright E2E suites
├── docs/                        # Complete project documentation & specifications
│   ├── automation/              # ATS platform register & security model
│   ├── development.md           # In-depth local setup, runtimes & testing guide
│   ├── evidence/                # Acceptance reports (V1, Live Search, Assisted Apply)
│   ├── job-engine-context.md    # User profile, motivation, and system goals
│   ├── resume/                  # Resume templates, source documents, and samples
│   ├── sources/                 # Source feasibility analysis (Himalayas, Jobicy, Remote OK)
│   ├── v1-product-spec.md       # V1 deterministic search product specification
│   ├── v2-assisted-apply-spec.md# V2 embedded assisted apply product specification
│   └── work-orders/             # Work Order registry, status board & task files
├── compose.yaml                 # Development PostgreSQL 17.11 container
├── compose.ci.yml               # Ephemeral PostgreSQL container for CI pipelines
├── dev.sh                       # One-command local development stack launcher
├── scripts/                     # Shared local & GitHub Actions CI scripts
├── package.json                 # Monorepo root scripts (pnpm workspaces)
├── pnpm-workspace.yaml          # Monorepo package workspace configuration
├── .node-version                # Pinned Node.js version (24.18.0)
├── .python-version              # Pinned CPython version (3.13.14)
└── .env.example                 # Example local environment variables
```

---

## ⚡ Quickstart & Local Setup

### 1. Prerequisites

Ensure the following tools are installed on your machine:
- **Node.js 24.18.0** (`.node-version`)
- **pnpm 10.34.5** (via Corepack: `corepack enable && corepack prepare pnpm@10.34.5 --activate`)
- **CPython 3.13.14** (`.python-version` via [uv](https://docs.astral.sh/uv/) or `pyenv`)
- **Docker** with Compose v2+

---

### 2. One-Command Dev Launcher

The fastest way to boot the full development stack (creates `.env` if missing, installs dependencies, starts PostgreSQL, runs migrations, and launches both API and Web servers):

```bash
./dev.sh
```

---

### 3. Step-by-Step Manual Setup

#### Step 3.1: Environment Configuration

Copy the example environment configuration:
```bash
cp .env.example .env
```

| Key | Default Value | Description |
| --- | --- | --- |
| `POSTGRES_DB` | `job_engine` | PostgreSQL database name |
| `POSTGRES_USER` | `job_engine` | Database username |
| `POSTGRES_PASSWORD` | `job_engine` | Database password |
| `POSTGRES_PORT` | `5432` | Local PostgreSQL host port |
| `DATABASE_URL` | `postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine` | Async database connection string |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` | Backend API origin used by the frontend |
| `JOB_ENGINE_RUNNER_SECRET` | *(32+ char secret)* | Shared secret for runner claims and internal authentication |
| `JOB_ENGINE_RESUME_ROOT` | `docs/resume` | Local filesystem directory for registered resume PDFs |
| `JOB_ENGINE_FRONTEND_ORIGIN` | `http://localhost:3000` | Allowed web origin for CORS and CSRF protection |
| `JOB_ENGINE_WEB_ORIGIN` | `http://127.0.0.1:3000` | Trusted web origin for Electron renderer bridge |
| `JOB_ENGINE_API_BASE_URL` | `http://127.0.0.1:8000` | Loopback backend API origin used by Electron main |

#### Step 3.2: Install Dependencies

```bash
# Install Node workspace dependencies (root, web, desktop)
corepack pnpm install --frozen-lockfile

# Sync Python virtual environment in apps/api
cd apps/api && uv sync --frozen && cd ../..
```

#### Step 3.3: Start the Database

```bash
# Start PostgreSQL container in the background
docker compose up -d postgres

# Verify container health
docker compose exec -T postgres pg_isready -U job_engine -d job_engine
```

#### Step 3.4: Apply Database Migrations

```bash
cd apps/api && uv run alembic upgrade head && cd ../..
```

#### Step 3.5: Run the Applications

```bash
# Option A: Run Backend and Web concurrently in your terminal
corepack pnpm run dev

# Option B: Run individual components
# Backend API (http://127.0.0.1:8000)
corepack pnpm --filter @job-engine/api run dev

# Frontend Web Dashboard (http://localhost:3000)
corepack pnpm --filter @job-engine/web run dev

# Desktop Electron Shell (Assisted Apply Workspace)
corepack pnpm --filter @job-engine/desktop run dev
```

Verify backend health:
```bash
curl http://127.0.0.1:8000/api/v1/health
# Response: {"status":"ok"}
```

---

## 🛠 Development & Testing

### Monorepo Root Commands

The root `package.json` delegates commands across all workspace packages:

```bash
# Run typechecking, linting, and validation across all packages
corepack pnpm run check

# Run test suites across backend, frontend, and desktop
corepack pnpm run test

# Build production artifacts for all packages
corepack pnpm run build

# Run the complete full-stack CI pipeline locally (ephemeral Postgres, checks, tests, E2E)
corepack pnpm run ci
# or:
./scripts/ci.sh
```

### Backend (`apps/api`) Commands

```bash
# Linting and formatting with Ruff
cd apps/api
uv run ruff check .
uv run ruff format --check .

# Static type checking with Mypy (strict mode)
uv run mypy src tests

# Run unit and database integration tests
uv run pytest

# Manage Alembic database migrations
uv run alembic upgrade head
uv run alembic downgrade -1
```

### Frontend (`apps/web`) Commands

```bash
# TypeScript typegen, typecheck & ESLint
corepack pnpm --filter @job-engine/web run check

# Vitest unit and component tests
corepack pnpm --filter @job-engine/web run test

# Playwright E2E and Axe accessibility tests
corepack pnpm --filter @job-engine/web run test:e2e

# Next.js production build
corepack pnpm --filter @job-engine/web run build
```

### Desktop (`apps/desktop`) Commands

```bash
# TypeScript check across source and test configurations
corepack pnpm --filter @job-engine/desktop run check

# Vitest unit tests (IPC, adapters, bounds, navigation policies)
corepack pnpm --filter @job-engine/desktop run test

# Run synthetic Electron lifecycle fixtures (requires running PostgreSQL)
corepack pnpm --filter @job-engine/desktop run test:fixtures

# Compile desktop main and preload scripts
corepack pnpm --filter @job-engine/desktop run build
```

### Stopping Services

```bash
# Stop PostgreSQL container (persists data volume)
docker compose down

# Destructive reset: Stop container and delete PostgreSQL data volume
docker compose down -v
```

---

## 🧠 Key Domain Concepts & Invariants

### 1. Job Catalog & Normalization (V1)
- **Source Posting (`source_postings`):** Raw job opportunity record ingested directly from an external adapter. Preserves verbatim text, tags, and timestamps for auditability.
- **Job Group (`job_groups`):** The canonical opportunity entity. Deduplication groups one or more source postings representing the same position into a single canonical Job Group.
- **Role Family:** Controlled taxonomy mapping job titles into standardized disciplines (`Backend`, `Full-Stack`, `Frontend`, `DevOps/Platform`, `Data/AI`, etc.).
- **Technology Aliases:** Canonical mapping of technical terms and keywords (e.g., `FastAPI`, `React`, `PostgreSQL`, `Docker`, `AWS`, `Python`).
- **Location Eligibility:** Structured classification identifying remote policies:
  - `BRAZIL` (explicitly mentions Brazil)
  - `LATAM` (Latin America region)
  - `WORLDWIDE` (anywhere / worldwide remote)
  - `UNKNOWN` (ambiguous or unstated geographic eligibility)
- **Honest "Unknown" State:** The engine never assumes or hallucinates data. If compensation, location, or seniority is absent from upstream data, it is explicitly preserved and displayed as `unknown`.

### 2. Live Search & Concurrent Streaming (V2 Batch 02)
- **On-Demand Concurrent Fetch:** Fetches live results simultaneously across all approved source adapters with per-source timeout barriers.
- **Server-Sent Events (SSE):** Streams ingestion stage progress, job discovery counts, and freshness updates to the web UI in real time.

### 3. Applicant Vault & Grounded Answering (V2 Batch 03)
- **Applicant Profile & Answer Bank:** Strictly typed personal identity, links, work authorization, experience summaries, and reusable question answers.
- **Local Resume Asset Catalog:** Tracks resume PDF assets via SHA-256 checksums and provides single-use file grants for run-scoped uploads.
- **6-Category Answer Policy:** Grounded decision engine returning closed choices (`AUTO_FILL`, `AUTO_FILL_AND_SUBMIT`, `REVIEW_REQUIRED`, `DECLINE_OPTIONAL`, `ABSTAIN`) with explicit provenance and confidence scores.

### 4. Embedded Assisted-Apply Workspace (V2 Batch 03)
- **Sandboxed `WebContentsView`:** Electron main process hosts the real HTTPS ATS page inside an isolated view with `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, no remote preload, and strict navigation policies.
- **Dedicated Application Session:** Persistent session partition (`persist:job-engine-ats`) completely separated from the user's daily browser profiles.
- **Platform Adapters:** Native support for **Greenhouse** and **Lever** structured job application flows.
- **`SEMI_AUTO_PAUSE_BEFORE_SUBMIT` Flow:** The runtime observes fields, requests answers, auto-fills authorized values, and uploads the verified resume. It unconditionally pauses at `SUBMIT_ARMED` for human review.
- **Explicit Owner Release Gate:** Final submission occurs only when the user explicitly clicks `Submit application` in the trusted UI. The backend enforces an idempotency barrier and one-click execution guarantee.
- **Ambiguous Outcome Safety:** Any uncertain submission outcome transitions to `SUBMISSION_UNKNOWN` and is never retried automatically.

---

## 📚 Documentation Index

| Document | Purpose |
| --- | --- |
| [Project Context](docs/job-engine-context.md) | High-level goals, target candidate profile, and long-term vision |
| [V1 Product Specification](docs/v1-product-spec.md) | Baseline specification, deterministic search, and V1 boundaries |
| [V2 Assisted Apply Specification](docs/v2-assisted-apply-spec.md) | Embedded desktop workspace, runtime architecture, and V2 boundaries |
| [Local Development Guide](docs/development.md) | In-depth runtime setup, pinned versions, environment keys, and commands |
| [Source Register](docs/sources/v1-source-register.md) | Legal feasibility and API evaluations for job sources (Himalayas, Jobicy, Remote OK) |
| [Automation Platform Register](docs/automation/platform-register.md) | ATS evaluation, platform permissions, and adapter specifications (Greenhouse, Lever) |
| [Automation Security Model](docs/automation/security-model.md) | Electron isolation, process boundaries, credential custody, and audit redaction |
| [Work Order Registry](docs/work-orders/README.md) | Task tracking system, execution rules, and ownership boundaries |
| [Work Order Status](docs/work-orders/STATUS.md) | Sole source of truth for live Work Order delivery status and owner approvals |
| [V1 Integration Acceptance Report](docs/evidence/v1-acceptance.md) | Formal acceptance evidence for Batch 01 deliverables |
| [Live Search Acceptance Report](docs/evidence/live-search-acceptance.md) | Formal acceptance evidence for Batch 02 deliverables |
| [Assisted Apply Acceptance Report](docs/evidence/embedded-assisted-apply-acceptance.md) | Formal acceptance evidence for Batch 03 deliverables |

---

## 📄 License

This repository is a private personal project. All rights reserved.

