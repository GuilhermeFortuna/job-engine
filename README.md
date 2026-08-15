# Job Engine

> **Personal Job-Search Intelligence Platform**  
> Discovering, normalizing, deduplicating, and ranking high-leverage remote software engineering opportunities.

[![Python](https://img.shields.io/badge/Python-3.13-blue.svg)](https://www.python.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688.svg)](https://fastapi.tiangolo.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-17-336791.svg)](https://www.postgresql.org/)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6.svg)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Private-lightgrey.svg)]()

---

## 🎯 Overview

**Job Engine** is a personal job-search intelligence engine designed to eliminate manual, noisy job hunting. It aggregates developer job postings from multiple sources, normalizes their data models, detects cross-source duplicates, and exposes an evidence-based search and filtering interface.

The project is built specifically to identify **high-value, fully remote international software engineering opportunities** (US & European companies) accessible to a senior developer based in Brazil, targeting compensation of **≥ $4,000/month ($48,000/year USD)**.

```
                      ┌─────────────────────────────────────────┐
                      │              Job Sources                │
                      │   (APIs, Webhooks, Curated Feeds)       │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │         Source Adapters (Python)        │
                      │  Isolated fetch, parsing & validation   │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │     Normalization & Deduplication       │
                      │  • Taxonomy mapping (tech, roles)       │
                      │  • Location eligibility vs. remote      │
                      │  • High-confidence duplicate grouping   │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │      PostgreSQL 17 System of Record     │
                      │ Canonical jobs, source postings & runs  │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │         FastAPI Search Service          │
                      │ Full-text & faceted search, pagination  │
                      └────────────────────┬────────────────────┘
                                           │
                                           ▼
                      ┌─────────────────────────────────────────┐
                      │        Next.js Unified Search UI        │
                      │ URL-synced filters, details, provenance │
                      └─────────────────────────────────────────┘
```

---

## 💡 Core Philosophy & V1 Principles

1. **Truthful Data Over Invented Certainty**:
   - **Remote ≠ Brazil Eligible**: A job labeled "Remote" is never assumed to hire internationally unless explicit source evidence confirms Brazil, Latin America, or Worldwide eligibility.
   - **First-Class Unknowns**: Missing compensation or ambiguous requirements are tracked as `unknown`, never coerced into `0` or filtered out silently.
   - **Audit Trails**: Transformed fields preserve raw source text and provenance alongside normalized values.

2. **Deterministic Processing**:
   - V1 relies on predictable, testable normalization rules and deterministic deduplication rather than probabilistic LLMs or fuzzy guessing.

3. **Isolated Source Adapters**:
   - Adding a new job source never breaks canonical search schemas or frontend contracts. Each adapter handles its own error boundaries and rate limits.

4. **Monorepo Architecture**:
   - Modular, lean design using `pnpm` workspaces for web tooling and `uv` for Python backend management.

---

## 🏗️ System Architecture

```
job-engine/
├── apps/
│   ├── api/                     # Python 3.13 / FastAPI backend service
│   │   ├── src/job_engine/
│   │   │   ├── domain/          # Canonical models, enums & taxonomy
│   │   │   ├── db/              # SQLAlchemy 2.0 async models & repositories
│   │   │   ├── services/        # Normalization & deduplication pipelines
│   │   │   └── api/             # FastAPI routers & search endpoints
│   │   ├── migrations/          # Alembic schema migrations
│   │   └── tests/               # Unit, repository & fixture-driven tests
│   │
│   └── web/                     # Next.js 16 / React / TypeScript frontend
│       ├── src/app/             # App Router layout & search interface
│       ├── src/components/      # UI components & search controls
│       └── tests/               # Vitest & Testing Library suites
│
├── docs/                        # Specifications & architectural governance
│   ├── job-engine-context.md    # Long-term vision & developer profile
│   ├── v1-product-spec.md       # Authoritative V1 scope & requirements
│   └── work-orders/             # Gated, tracked implementation slices
│       ├── STATUS.md            # Master status board across all work orders
│       ├── back/                # Backend Work Orders (BACK-001 - BACK-007)
│       ├── front/               # Frontend Work Orders (FRONT-001 - FRONT-003)
│       └── cross-repo/          # Cross-cutting Work Orders (CROSS-001 - CROSS-003)
│
├── compose.yaml                 # Local development PostgreSQL service
└── package.json                 # Monorepo root scripts & pnpm workspace config
```

---

## 🛠️ Technology Stack

| Layer | Technologies | Purpose |
| --- | --- | --- |
| **Backend** | Python 3.13, FastAPI, Pydantic v2 | Ingestion pipelines, normalization, search API |
| **Database** | PostgreSQL 17, SQLAlchemy 2.0 (Async), Alembic | Relational storage, canonical catalog, full-text search |
| **Frontend** | TypeScript, React 19, Next.js 16 (App Router) | Responsive search UI, URL state management |
| **Styling** | Vanilla CSS & Design Tokens | Lightweight, accessible, performant design system |
| **Tooling** | `pnpm`, `uv`, `Ruff`, `mypy` (strict), `Vitest`, `pytest` | Fast, reproducible linting, typing, and testing |
| **Infrastructure** | Docker Compose | Local PostgreSQL containerization |

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed locally:

- **Node.js**: `24.x` (managed via `.node-version` / fnm / nvm)
- **pnpm**: `10.x` (`corepack enable pnpm`)
- **Python**: `3.13.x` (managed via `.python-version` / pyenv)
- **uv**: `0.6+` (fast Python package manager: `curl -LsSf https://astral.sh/uv/install.sh | sh`)
- **Docker & Docker Compose**: For local PostgreSQL

### 1. Clone & Configure

```bash
git clone https://github.com/GuilhermeFortuna/job-engine.git
cd job-engine

# Copy environment template
cp .env.example .env
```

### 2. Start PostgreSQL Database

```bash
# Start PostgreSQL 17 container
docker compose up -d postgres

# Verify container health
docker compose ps
```

### 3. Install Dependencies

```bash
# Install frontend workspace dependencies
corepack pnpm install --frozen-lockfile

# Sync Python backend virtual environment
cd apps/api && uv sync --frozen && cd ../..
```

### 4. Run Migrations & Start Development Servers

```bash
# Run database migrations
cd apps/api && uv run alembic upgrade head && cd ../..

# Start both backend and frontend in development mode
corepack pnpm run dev
```

- **Web UI**: [http://localhost:3000](http://localhost:3000)
- **FastAPI API**: [http://localhost:8000](http://localhost:8000)
- **Interactive API Docs (Swagger)**: [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🧪 Quality & Validation

Job Engine maintains strict type-checking, linting, and automated test coverage across both workspaces.

```bash
# Run all workspace checks (linting, type-checking, formatting)
corepack pnpm run check

# Run all test suites
corepack pnpm run test

# Individual backend checks
cd apps/api
uv run ruff check .
uv run ruff format --check .
uv run mypy src tests
uv run pytest

# Individual frontend checks
cd apps/web
corepack pnpm run check
corepack pnpm run test
```

---

## 📋 Documentation & Work Orders

Development is executed in structured, dependency-gated **Work Orders** to ensure clean boundaries and prevent scope creep:

- 📖 **[Project Context](docs/job-engine-context.md)**: Developer background, compensation goals, and long-term vision.
- 📐 **[V1 Product Specification](docs/v1-product-spec.md)**: Detailed feature contracts, search semantics, and acceptance criteria.
- 🚦 **[Work Order Status Board](docs/work-orders/STATUS.md)**: Live progress and dependency graph for active implementation tasks.
- 📂 **[Work Order Registry](docs/work-orders/README.md)**: Specifications for `BACK-*`, `FRONT-*`, and `CROSS-*` work items.

---

## 🗺️ Roadmap

- [x] **Phase 0: Specifications & Work Order Architecture** (Complete)
- [ ] **Batch 01: V1 Aggregation & Search Foundation** (In Progress)
  - [ ] Local monorepo & database foundation (`CROSS-001`)
  - [ ] Source feasibility study for 3 initial sources (`CROSS-002`)
  - [ ] FastAPI backend & Next.js frontend foundations (`BACK-001`, `FRONT-001`)
  - [ ] Canonical data models, migrations & persistence (`BACK-002`)
  - [ ] Deterministic normalization & deduplication engine (`BACK-003`)
  - [ ] Ingestion adapters for 3 approved job sources (`BACK-004`, `BACK-005`, `BACK-006`)
  - [ ] Persisted faceted search API (`BACK-007`)
  - [ ] URL-synced unified search UI (`FRONT-002`, `FRONT-003`)
  - [ ] Integrated V1 end-to-end acceptance (`CROSS-003`)
- [ ] **Future Horizons (Post-V1)**:
  - [ ] LLM-assisted requirement extraction & deep seniority analysis
  - [ ] Personalized fit scoring & automatic prioritization
  - [ ] Market intelligence dashboards (salary distributions, tech demand trends)
  - [ ] Ingestion scheduler & automated freshness monitors

---

## 📄 License

Private personal project. All rights reserved.
