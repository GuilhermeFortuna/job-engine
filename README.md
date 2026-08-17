# Job Engine

<p align="center">
  <strong>Personal Job-Search Intelligence Engine for International Remote Software Engineering</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Node.js-24.18.0-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js 24.18.0" />
  <img src="https://img.shields.io/badge/pnpm-10.34.5-F69220?style=flat-square&logo=pnpm&logoColor=white" alt="pnpm 10.34.5" />
  <img src="https://img.shields.io/badge/Python-3.13.14-3776AB?style=flat-square&logo=python&logoColor=white" alt="Python 3.13.14" />
  <img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=flat-square&logo=fastapi&logoColor=white" alt="FastAPI" />
  <img src="https://img.shields.io/badge/Next.js-16.3-000000?style=flat-square&logo=next.js&logoColor=white" alt="Next.js 16" />
  <img src="https://img.shields.io/badge/PostgreSQL-17.11-4169E1?style=flat-square&logo=postgresql&logoColor=white" alt="PostgreSQL 17" />
  <img src="https://img.shields.io/badge/License-Private-grey?style=flat-square" alt="Private License" />
</p>

---

## 🎯 Overview

**Job Engine** is a personal job-search engine designed to cut through the noise of modern job boards. It aggregates open software-engineering positions from multiple sources, normalizes unstructured metadata, detects duplicates across feeds, and surfaces high-signal opportunities in a unified, deterministic search interface.

### The Problem It Solves
Finding international remote software roles while based in Brazil typically requires jumping between dozens of job boards, filtering through misleading "remote" tags that restrict candidates to US time zones or US work authorization, and dealing with duplicate postings.

Job Engine standardizes this workflow by:
1. **Aggregating** postings from approved, legally compliant public feeds and APIs.
2. **Normalizing** technologies, seniority levels, role families, and compensation ranges.
3. **Validating Geographic Eligibility** (specifically detecting explicit Brazil, LATAM, or Worldwide remote eligibility).
4. **Deduplicating** identical job listings posted across multiple boards into canonical **Job Groups**.
5. **Preserving Provenance** — maintaining raw upstream data alongside normalized representations for full auditability.

> [!NOTE]
> **V1 Scope Boundary:** Job Engine V1 is a deterministic aggregator and search tool. It does not perform speculative AI scoring, automated applications, resume generation, or job scraping of unauthorized sites.

---

## 🏗 Architecture & Pipeline

```mermaid
flowchart TD
    subgraph Ingestion["1. Data Ingestion"]
        S1[Himalayas API] --> A1[Himalayas Adapter]
        S2[Jobicy API] --> A2[Jobicy Adapter]
        S3[Third Source / Feed] --> A3[Source Adapter]
    end

    subgraph Processing["2. Normalization & Deduplication"]
        A1 & A2 & A3 --> N[Normalization Engine]
        N -->|Role Family, Tech, Location, Salary| D[Deduplication Service]
        D -->|Fingerprinting & Similarity| M[Canonical Job Grouping]
    end

    subgraph Storage["3. Persistence"]
        M --> DB[(PostgreSQL 17\nCatalog & Audit Tables)]
    end

    subgraph Application["4. Serving & UI"]
        DB --> API[FastAPI Backend\n/api/v1/jobs /api/v1/health]
        API --> Web[Next.js 16 Web Dashboard\nUnified Search & Filters]
    end
```

---

## 🚀 Tech Stack

| Layer | Technology | Details |
| --- | --- | --- |
| **Monorepo** | pnpm 10.34.5 | Workspace orchestrator for frontend & backend tasks |
| **Backend Service** | Python 3.13.14, FastAPI, uv | High-performance asynchronous REST API (`apps/api`) |
| **Data Validation** | Pydantic v2 | Strictly typed, frozen canonical models and taxonomy schemas |
| **ORM & Migrations** | SQLAlchemy 2.0 (async), Alembic | Fully typed async queries and declarative schema migrations |
| **Database** | PostgreSQL 17.11 | Relational storage for canonical jobs, postings, and ingestion runs |
| **Frontend Web** | Next.js 16 (App Router), React 19, TypeScript | Server and Client components with URL-driven search state (`apps/web`) |
| **Testing & Quality** | Pytest, Vitest, Ruff, Mypy (strict), ESLint | Comprehensive test matrices and strict type validation |
| **Infrastructure** | Docker & Compose v2+ | Containerized local PostgreSQL with health checks |

---

## 📁 Repository Structure

```text
job-engine/
├── apps/
│   ├── api/                     # FastAPI backend service
│   │   ├── alembic.ini          # Database migration configuration
│   │   ├── migrations/          # Alembic schema versions
│   │   ├── pyproject.toml       # Python dependencies (uv-managed)
│   │   ├── src/job_engine/      # Application source code
│   │   │   ├── api/             # HTTP routes, routers, and schemas
│   │   │   ├── config.py        # Environment settings (Pydantic Settings)
│   │   │   ├── data/            # Canonical taxonomies & alias mappings (JSON)
│   │   │   ├── db/              # SQLAlchemy models, sessions & repositories
│   │   │   ├── domain/          # Domain entities, enums, and business logic
│   │   │   ├── main.py          # FastAPI application factory
│   │   │   └── services/        # Ingestion, normalization & deduplication logic
│   │   └── tests/               # Pytest suite (unit, db integration, services)
│   └── web/                     # Next.js 16 frontend application
│       ├── package.json         # Frontend dependencies & scripts
│       ├── src/
│       │   ├── app/             # App Router pages, layouts, and styles
│       │   ├── lib/             # Environment validation and utilities
│       │   └── test/            # Frontend test setup and Vitest tests
│       └── vitest.config.ts     # Vitest configuration
├── docs/                        # Complete project documentation & specifications
│   ├── development.md           # In-depth local setup and environment guide
│   ├── job-engine-context.md    # User profile, motivation, and system goals
│   ├── v1-product-spec.md       # Product specifications and constraints
│   ├── sources/                 # Source feasibility and API evaluations
│   └── work-orders/             # Work Order registry, status, and task files
├── compose.yaml                 # PostgreSQL container service definition
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

### 2. Environment Configuration

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
| `DATABASE_URL` | `postgresql://job_engine:job_engine@127.0.0.1:5432/job_engine` | Database connection string |
| `NEXT_PUBLIC_API_BASE_URL` | `http://127.0.0.1:8000` | Backend API origin used by the frontend |

### 3. Install Dependencies

Install root and workspace dependencies:
```bash
# Install Node workspace dependencies
corepack pnpm install --frozen-lockfile

# Sync Python virtual environment in apps/api
cd apps/api && uv sync --frozen && cd ../..
```

### 4. Start the Database

Start the PostgreSQL service in the background and verify its health:
```bash
# Start PostgreSQL container
docker compose up -d postgres

# Verify connection health
docker compose exec -T postgres pg_isready -U job_engine -d job_engine
```

### 5. Run Database Migrations

Apply the latest schema migrations to PostgreSQL:
```bash
cd apps/api && uv run alembic upgrade head && cd ../..
```

### 6. Run the Applications

You can start both frontend and backend concurrently or run them individually:

```bash
# Run all workspace applications concurrently
corepack pnpm run dev

# Or start the backend API individually (http://127.0.0.1:8000)
corepack pnpm --filter @job-engine/api run dev

# Or start the frontend individually (http://localhost:3000)
corepack pnpm --filter @job-engine/web run dev
```

Check backend health by visiting:
```bash
curl http://127.0.0.1:8000/api/v1/health
# Output: {"status":"ok"}
```

---

## 🛠 Development & Testing

### Monorepo Root Commands

The root `package.json` provides scripts that delegate across all workspaces:

```bash
# Run typechecking, linting, and tests across all packages
corepack pnpm run check

# Run tests across all packages
corepack pnpm run test

# Build all packages
corepack pnpm run build
```

### Backend (`apps/api`) Commands

From within `apps/api` (or using `uv run`):

```bash
# Linting with Ruff
uv run ruff check .
uv run ruff format --check .

# Static type checking with Mypy (strict mode)
uv run mypy src tests

# Run unit and integration test suite
uv run pytest

# Manage database migrations
uv run alembic upgrade head
uv run alembic downgrade -1
```

### Frontend (`apps/web`) Commands

From within `apps/web` (or using pnpm filters):

```bash
# TypeScript type checking & ESLint
corepack pnpm --filter @job-engine/web run check

# Run frontend tests with Vitest
corepack pnpm --filter @job-engine/web run test

# Production build
corepack pnpm --filter @job-engine/web run build
```

### Stopping Services

```bash
# Stop PostgreSQL container (preserves data volume)
docker compose down

# Destructive reset: Stop PostgreSQL and remove data volume
docker compose down -v
```

---

## 🧠 Key Domain Concepts

- **Source Posting (`source_postings`):** Raw job opportunity received directly from an external adapter. Retains original text, URLs, tags, and timestamps.
- **Job Group (`job_groups`):** The canonical opportunity entity. Deduplication links one or more source postings referring to the same physical position to a single Job Group.
- **Role Family:** Controlled taxonomy mapping job titles into standardized disciplines (`Backend`, `Full-Stack`, `Frontend`, `DevOps/Platform`, `Data/AI`, etc.).
- **Technology Aliases:** Canonical mapping of technical keywords (e.g., `FastAPI`, `React`, `PostgreSQL`, `Docker`, `AWS`, `Python`).
- **Location Eligibility:** Structured classification identifying remote policies:
  - `BRAZIL` (explicitly mentions Brazil)
  - `LATAM` (Latin America region)
  - `WORLDWIDE` (anywhere / worldwide remote)
  - `UNKNOWN` (ambiguous or unstated geographic eligibility)
- **Honest "Unknown" State:** The engine never hallucinates or assumes values. If compensation, location, or seniority is absent from upstream data, it is explicitly treated and displayed as `unknown`.

---

## 📚 Documentation Index

| Document | Purpose |
| --- | --- |
| [Project Context](docs/job-engine-context.md) | High-level goals, target candidate profile, and long-term vision |
| [V1 Product Specification](docs/v1-product-spec.md) | Baseline specification, user experience, and V1 boundaries |
| [Local Development Guide](docs/development.md) | In-depth runtime setup, pinned versions, and environment rules |
| [Source Register](docs/sources/v1-source-register.md) | Analysis of candidate job board APIs (Himalayas, Jobicy, etc.) |
| [Work Order Registry](docs/work-orders/README.md) | Task tracking system, execution rules, and ownership boundaries |
| [Work Order Status](docs/work-orders/STATUS.md) | Live dependency sequence and delivery status of all tasks |

---

## 📄 License

This repository is a private personal project. All rights reserved.
