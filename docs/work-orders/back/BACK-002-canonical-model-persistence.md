# BACK-002: Canonical Job Model and Persistence

**Status:** `BLOCKED`

**Owner:** Unassigned

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

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending

