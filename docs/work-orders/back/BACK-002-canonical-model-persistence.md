# BACK-002: Canonical Job Model and Persistence

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** BACK-001

**Unblocks:** BACK-003, BACK-004

**Product spec:** Sections 5, 7, 9, 12, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement the validated canonical job catalog, PostgreSQL schema, migrations, and repository methods required to persist source postings, grouped jobs, and ingestion runs. Do not implement source fetching, deduplication decisions, or HTTP job routes.

## Owned files

- `/apps/api/alembic.ini`
- `/apps/api/migrations/env.py`
- `/apps/api/migrations/script.py.mako`
- `/apps/api/migrations/versions/0001_canonical_job_catalog.py`
- `/apps/api/src/job_engine/domain/__init__.py`
- `/apps/api/src/job_engine/domain/enums.py`
- `/apps/api/src/job_engine/domain/jobs.py`
- `/apps/api/src/job_engine/db/base.py`
- `/apps/api/src/job_engine/db/models.py`
- `/apps/api/src/job_engine/db/repositories.py`
- `/apps/api/tests/domain/test_jobs.py`
- `/apps/api/tests/db/test_migrations.py`
- `/apps/api/tests/db/test_repositories.py`
- `/apps/api/pyproject.toml` and `/apps/api/uv.lock` (migration/test dependencies only)

## Fixed data contract

Implement typed values from V1 spec Section 7 with these controlled enums:

- `RemoteStatus`: `remote`, `hybrid`, `onsite`, `unknown`
- `EmploymentType`: `full_time`, `part_time`, `contract`, `temporary`, `internship`, `unknown`
- `Seniority`: `internship`, `junior`, `mid`, `senior`, `lead_staff`, `unknown`
- `JobStatus`: `active`, `stale`, `closed`, `unknown`
- `IngestionRunStatus`: `running`, `success`, `partial_success`, `failure`

Use UUID primary keys internally. Persist separate `job_groups`, `source_postings`, `job_group_postings`, and `ingestion_runs` tables. A source posting is unique on `(source_id, source_posting_id)`. Store URLs as strings validated at the domain boundary; use timezone-aware UTC timestamps. Preserve original text/values and structured normalized fields. Technology terms and eligible regions/countries must use relational child tables or typed PostgreSQL arrays with explicit uniqueness; do not store the entire canonical model as an opaque JSON blob.

## Procedure

1. Translate every Section 7 field into immutable/validated domain input and persisted ORM representations; document unavoidable nullability in code comments.
2. Add SQLAlchemy declarative models and explicit relationships without source-specific columns.
3. Add Alembic configuration and one deterministic initial migration; migrations must use the configured `DATABASE_URL`.
4. Implement repository operations for ingestion-run lifecycle, idempotent source-posting upsert, job-group creation/update, group membership, and retrieval by internal/source identity.
5. Ensure original compensation/location/seniority values survive round trips independently of normalized values.
6. Add tests for enum rejection, UTC handling, uniqueness, rollback, idempotent upsert, provenance retention, and migration upgrade/downgrade/upgrade on a disposable test database.
7. Run validation against the local PostgreSQL service, then inspect the generated schema rather than relying only on mocked tests.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv sync --frozen
cd apps/api && uv run alembic upgrade head
cd apps/api && uv run alembic downgrade base
cd apps/api && uv run alembic upgrade head
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/domain tests/db
git diff --check
```

## Acceptance criteria

- Every required V1 canonical field has a typed representation and auditable original value where meaning is transformed.
- Unknown states are valid first-class values; missing salary is never persisted as zero.
- Source-posting upsert is idempotent and the uniqueness constraint is enforced by PostgreSQL.
- Migration round-trip and repository integration tests pass on PostgreSQL.
- Source provenance and multiple postings per job group round-trip without loss.
- No adapter, normalization/deduplication policy, search route, or frontend code is added.

## Forbidden decisions

- No SQLite compatibility layer, generic entity-attribute-value model, vector field, LLM field, or speculative application-tracking table.
- No automatic eligibility inference from `remote`.
- No destructive merge/delete API for possible duplicates.
- No source payload columns in canonical tables except explicitly preserved raw/source metadata bounded to a source posting.

## Handoff evidence

- Field-to-column/domain mapping
- Migration and repository test transcript
- Idempotent upsert counts
- Example round trip showing original and normalized/unknown values

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `feat/back-002-canonical-model-persistence`
- Dispatched at: 2026-08-16T20:46:00-03:00

## Completion record

- Commit: Pending
- Evidence: See below
- Independent reviewer: Pending

### Field-to-column/domain mapping

Section 7 fields map to frozen Pydantic models in `job_engine.domain.jobs` and PostgreSQL columns as follows. Nullability is documented in domain comments: missing compensation amounts are `None`, never `0`. Location-eligibility `unknown` is `JobGroupInput.location_eligibility_unknown` plus zero `job_group_eligible_locations` rows, not a region named `unknown`.

| V1 field | Domain | Persistence |
| --- | --- | --- |
| Internal job-group ID | `JobGroup.id` | `job_groups.id` UUID PK |
| Title display + original | `title`, `title_original` | `job_groups.title`, `title_original` |
| Company display + original | `company`, `company_original` | `job_groups.company`, `company_original` |
| Description | `description` | `job_groups.description` / `source_postings.description` (nullable) |
| Source postings | `SourcePosting` + `JobGroup.source_postings` | `source_postings` unique `(source_id, source_posting_id)`; membership `job_group_postings` |
| Location original + normalized | `location_original`, `location_normalized_country`, `location_normalized_region` | matching `job_groups` columns; posting original on `source_postings.location_original` |
| Remote status | `RemoteStatus` | PG enum `remote_status` |
| Location eligibility | `location_eligibility_unknown`, `EligibleLocation` | `job_groups.location_eligibility_unknown`; child table `job_group_eligible_locations(region, evidence_text)` unique `(job_group_id, region)` |
| Employment type | `EmploymentType` | PG enum `employment_type` |
| Seniority + original | `seniority`, `seniority_original` | PG enum `seniority` + `seniority_original` |
| Technologies | `TechnologyTerm` | `job_group_technologies(term, source_text)` unique `(job_group_id, term)`; posting original text on `source_postings.technologies_original_text` |
| Compensation | `Compensation` | original text/currency/period/min/max plus optional annual USD bounds on both `job_groups` and `source_postings`; numeric columns nullable with no default |
| Dates | `published_at`, `first_seen_at`, `last_seen_at`, `closed_at` | `timestamptz`; posting also has `source_timestamp` |
| Status | `JobStatus` | PG enum `job_status` |
| Ingestion metadata | `IngestionRun`, `ingestion_run_id`, `adapter_version` | `ingestion_runs` plus FKs on groups/postings |
| Bounded source extras | `raw_source_metadata` | `source_postings.raw_source_metadata` JSONB only |

### Required-validation transcript

PostgreSQL `postgres:17.11` was healthy (`pg_isready` accepting connections) before this pass.

```text
$ cd apps/api && uv sync --frozen
Checked 44 packages in 0.43ms

$ cd apps/api && uv run alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade  -> 0001_canonical_job_catalog

$ cd apps/api && uv run alembic downgrade base
INFO  [alembic.runtime.migration] Running downgrade 0001_canonical_job_catalog ->

$ cd apps/api && uv run alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade  -> 0001_canonical_job_catalog

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
23 files already formatted

$ cd apps/api && uv run mypy src tests
Success: no issues found in 20 source files

$ cd apps/api && uv run pytest tests/domain tests/db
collected 21 items
tests/domain/test_jobs.py .............
tests/db/test_migrations.py .
tests/db/test_repositories.py .......
21 passed
```

Live schema after the second `upgrade head` (`psql \dt` / `\dT+` / `\d`): tables `ingestion_runs`, `job_groups`, `source_postings`, `job_group_postings`, `job_group_technologies`, `job_group_eligible_locations`, `alembic_version`; enums `remote_status`, `employment_type`, `seniority`, `job_status`, `ingestion_run_status`; unique `(source_id, source_posting_id)` on `source_postings`; compensation numeric columns nullable with no default.

### Idempotent upsert counts

`test_source_posting_upsert_is_idempotent` upserts the same `(jobicy, abc-123)` twice. `SELECT count(*) FROM source_postings` is `1`. The second upsert updates `title_original` and preserves `id` and `first_seen_at`. A raw second insert of the same identity raises `IntegrityError` from PostgreSQL.

### Example original vs normalized/unknown round trip

`test_job_group_round_trips_original_and_normalized_values` persisted:

- `title` = `Python Engineer`, `title_original` = `Python Engineer (Backend)`
- `seniority` = `unknown`, `seniority_original` = `ninja`
- `compensation.original_text` = `R$ 10k/mês`, `currency` = `BRL`, `minimum` = `10000`, `annual_usd_minimum` = `None`
- `first_seen_at` supplied as UTC-3 and stored as `2026-08-16 23:30:00+00`

`test_multiple_source_postings_round_trip_on_one_job_group` attached Jobicy and Himalayas postings to one group; retrieval by `(himalayas, xyz-9)` returned that group with both source IDs and `raw_source_metadata={"feed": "programming"}`.

No `/jobs` route, adapter, or normalization policy was added. `create_app()` still exposes only `GET /api/v1/health`.
