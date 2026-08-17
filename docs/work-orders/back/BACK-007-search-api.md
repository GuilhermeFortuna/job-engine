# BACK-007: Persisted V1 Search and Details API

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** BACK-003

**Unblocks:** FRONT-002, FRONT-003, CROSS-003

**Product spec:** Sections 6, 11, 14, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Expose the persisted canonical catalog through stable FastAPI contracts for V1 search, details, filter vocabulary, and catalog/source health. Do not fetch sources during interactive requests.

## Owned files

- `/apps/api/src/job_engine/api/__init__.py`
- `/apps/api/src/job_engine/api/dependencies.py`
- `/apps/api/src/job_engine/api/schemas.py`
- `/apps/api/src/job_engine/api/jobs.py`
- `/apps/api/src/job_engine/api/catalog.py`
- `/apps/api/src/job_engine/services/search.py`
- `/apps/api/src/job_engine/main.py` (router registration only)
- `/apps/api/src/job_engine/db/repositories.py` (search queries only)
- `/apps/api/src/job_engine/config.py` (`enabled_sources` only)
- `/apps/api/tests/api/conftest.py`
- `/apps/api/tests/factories.py`
- `/apps/api/tests/api/test_jobs_search.py`
- `/apps/api/tests/api/test_job_details.py`
- `/apps/api/tests/api/test_catalog.py`
- `/apps/api/tests/services/test_search.py`

## Fixed HTTP contract

- `GET /api/v1/jobs`: paginated active job groups.
- `GET /api/v1/jobs/{job_group_id}`: normalized details and all source postings; unknown ID returns 404.
- `GET /api/v1/catalog/filters`: controlled vocabularies and enabled source IDs.
- `GET /api/v1/catalog/health`: catalog freshness and latest per-source ingestion status with no secrets.

`GET /jobs` query parameters:

- `q`
- repeated `role_family`, `technology`, `remote_status`, `location_eligibility`, `seniority`, and `source`
- `minimum_annual_usd`
- `include_unknown_compensation` defaulting to `true`
- `posted_within` values `24h`, `7d`, `30d`, or `any`
- `sort` values `newest` or `compensation_desc`
- `page` default `1`, minimum `1`
- `page_size` default `25`, minimum `1`, maximum `100`

Different categories combine with AND; repeated values within one category combine with OR. Default ordering is published/first-seen newest first, then internal UUID for stability. Compensation sort places unknown compensation after known values. Responses include `items`, `page`, `page_size`, `total`, and `total_pages`.

Controlled query values come from BACK-002/BACK-003: role families are `software_developer`, `full_stack`, `backend`, `python`, `frontend`, `ai_application`, and `applied_ai`; location eligibility is `brazil`, `latin_america`, `worldwide`, or `unknown`; the remaining enum values use the canonical model verbatim. Unsupported controlled values return HTTP 422 rather than being ignored.

## Procedure

1. Define strict request/response schemas from the canonical model; expose display/original/evidence values required by V1 without raw source payloads.
2. Implement repository-level PostgreSQL filtering and deterministic pagination; do not load the full catalog into Python.
3. Implement PostgreSQL-native free-text matching over title, company, description, and technology terms with documented case/accent behavior.
4. Exclude closed and stale jobs by default and return one item per job group.
5. Implement compensation/unknown, eligibility/unknown, date, source-group, sorting, and pagination semantics exactly as fixed above.
6. Implement details with all retained source names, URLs, timestamps, and freshness/evidence fields.
7. Implement filter vocabulary and catalog health from persisted/configured state; a failed latest run must not make persisted search unavailable.
8. Add seeded PostgreSQL integration tests covering every filter alone, AND/OR combinations, sorting ties, unknown values, grouped sources, closed/stale exclusion, pagination stability, empty results, validation errors, and 404.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest
git diff --check
```

## Acceptance criteria

- All four fixed endpoints return runtime-validated schemas.
- Every V1 search parameter and combination rule has PostgreSQL-backed integration coverage.
- Search returns one row per group with stable pagination and correct source aggregation.
- Unknown compensation and location eligibility behave explicitly and truthfully.
- Closed/stale records are excluded by default; partial source failure is visible through health without breaking search.
- No live source fetch, ingestion-control endpoint, frontend logic, authentication, or speculative scoring is introduced.

## Forbidden decisions

- No GraphQL, Elasticsearch, external search service, vector search, relevance/fit score, or frontend-side full-catalog filtering.
- No `remote == eligible` shortcut and no salary-zero fallback.
- No raw source payload or secret/error detail in browser responses.
- No silent contract change after FRONT-002 begins; use an explicit coordination update.

## Handoff evidence

- Final request/response examples
- Seeded scenario matrix and result counts
- Query/pagination test transcript
- Catalog-health partial-failure example
- Required-validation transcript

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `development`
- Dispatched at: 2026-08-16T22:58:00-03:00

## Completion record

- Commit: Pending (uncommitted on `development`; not committed because this branch is shared with BACK-004)
- Evidence: See below
- Independent reviewer: Pending

### Final request/response examples

Empty search:

```http
GET /api/v1/jobs
```

```json
{"items":[],"page":1,"page_size":25,"total":0,"total_pages":0}
```

Unknown group:

```http
GET /api/v1/jobs/{unknown-uuid}
```

`404 {"detail":"Job group not found"}`

Malformed UUID: `422`. Unsupported controlled query values (`role_family`, `technology`, `source`, `sort`, `posted_within`, `page`, `page_size`): `422`.

List items include `description_excerpt`, grouped `sources` ordered by `linked_at ASC, source_postings.id ASC`, and `primary_application_url` from the first source. Details replace the excerpt with full `description` and add `status`, `closed_at`, and `source_postings` (including `linked_at`). `raw_source_metadata`, `application_url_canonical`, `ingestion_run_id`, and `error_summaries` are never emitted. Compensation amounts are JSON strings, never `0` for missing values.

### Seeded scenario matrix and result counts

`tests/api/test_jobs_search.py` seeds 11 groups. Search returns only `active` rows (closed/stale excluded, still fetchable by ID). Representative counts:

- `role_family=frontend` → 1 (`React Developer`)
- `role_family=python&role_family=frontend` → 2 (OR within category)
- `role_family=python&remote_status=remote` → 1 (AND across categories)
- `q=Grouped` → 1 item with sources `himalayas` then `jobicy`
- `minimum_annual_usd=100000&include_unknown_compensation=true` includes unknown-compensation jobs; `false` excludes them
- `posted_within=24h` excludes the 40-day-old listing; `any` includes it

### Query/pagination test transcript

`test_newest_sort_and_pagination_stability` uses `sort=newest&page_size=2`. Page 1 and page 2 are disjoint; `total_pages = ceil(total / 2)`; the newest title (`100% remote specialist`) is first. Page 99 returns `items=[]` with the same `total`.

### Catalog-health partial-failure example

`test_partial_failure_keeps_failed_source_jobs_searchable`: Himalayas latest run `failure` (error summaries persisted, not returned); Jobicy latest run `success`. Search still returns **both** sources' active jobs. Health:

- `sources[0].source_id=himalayas`, `latest_run_status=failure`, counts present
- `sources[1].latest_run_status=success`
- body contains no `error_summaries` / secret text
- `never_run` sources use JSON `null` for timestamps and counts
- same `started_at` tie resolved by `id ASC`

### Required-validation transcript

```text
$ docker compose up -d postgres
Container job-engine-postgres-1 Running

$ cd apps/api && uv run alembic upgrade head
INFO  [alembic.runtime.migration] Running upgrade 0001_canonical_job_catalog -> 0002_normalization_identity

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
(owned BACK-007 files already formatted)

$ cd apps/api && uv run mypy src tests
Success: no issues found in 52 source files

$ cd apps/api && uv run pytest tests/api tests/services/test_search.py tests/test_health.py
27 passed

$ cd apps/api && uv run pytest
106 passed, 2 failed, 1 skipped
# Failures are BACK-004 ingestion tests (test_malformed_record_keeps_valid,
# test_two_successful_misses_mark_stale), outside this order.

$ git diff --check
(no whitespace errors in BACK-007 owned files)
```

`GET /api/v1/health` remains process health and does not require Postgres.
