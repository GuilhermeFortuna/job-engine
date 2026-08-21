# BACK-004: Adapter Contract and First Approved Source

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** CROSS-002, BACK-002, BACK-003

**Unblocks:** BACK-005, BACK-006, CROSS-003

**Product spec:** Sections 8, 9, 12, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Define the minimal source-adapter boundary and prove the complete fetch-to-persistence path with the source mapped to BACK-004 in the approved source register.

## Dispatch binding gate

Bound source ID: `himalayas` (CROSS-002 mapping). Owned file, fixture, and test names use this ID.

## Owned files

- `/apps/api/src/job_engine/sources/__init__.py`
- `/apps/api/src/job_engine/sources/base.py`
- `/apps/api/src/job_engine/sources/registry.py`
- `/apps/api/src/job_engine/sources/himalayas.py`
- `/apps/api/src/job_engine/services/ingestion.py`
- `/apps/api/src/job_engine/ingest.py`
- `/apps/api/tests/sources/fixtures/himalayas/success.json`
- `/apps/api/tests/sources/fixtures/himalayas/malformed.json`
- `/apps/api/tests/sources/test_contract.py`
- `/apps/api/tests/sources/test_himalayas.py`
- `/apps/api/tests/services/test_ingestion.py`
- `/apps/api/src/job_engine/config.py` (documented source settings only)
- `/apps/api/pyproject.toml` and `/apps/api/uv.lock` (source client dependency only if required)
- `/docs/sources/v1-source-register.md` (implemented-field notes only)

## Fixed adapter contract

- Typed adapter methods: bounded page fetch, source-record parse, canonical candidate mapping, and closure/last-seen signal extraction.
- Structured adapter errors distinguish authorization, rate limit, transport, upstream schema, and record-validation failures.
- Registry lookup is explicit by approved source ID; no filesystem/plugin discovery.
- HTTP clients have explicit connect/read timeouts, bounded retry only for documented transient failures, source-appropriate user agent, and no retry for authorization/schema errors.
- One malformed record increments rejection/error counts without rolling back other valid records.
- Each run records fetched, accepted, rejected, inserted, updated, and stale/closed counts supported by the source.
- Repeating unchanged input is idempotent.

## Procedure

1. Recheck the approved register, official schema, access constraints, credential names, and source-specific freshness policy.
2. Define the smallest adapter protocol needed by this source and the next two approved sources; do not create a general plugin framework.
3. Implement the registry, error types, ingestion orchestration, and transaction boundaries.
4. Add a sanitized, minimal success fixture and malformed-record fixture permitted by the source policy.
5. Implement `himalayas` pagination, parsing, mapping, provenance, rate handling, and closure/last-seen behavior exactly as documented.
6. Feed mapped records through BACK-003 normalization/deduplication and BACK-002 repositories.
7. Test contract conformance, multi-page behavior, idempotency, partial record failure, total source failure, and secret redaction.
8. If authorized credentials are available, run one bounded live smoke request and record counts/metadata without committing payload corpora. Otherwise leave the required live gate explicitly unresolved; do not fabricate success.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/sources tests/services/test_ingestion.py
git diff --check
```

## Acceptance criteria

- The dispatch placeholder is fully bound to the CROSS-002 source ID before implementation.
- The adapter conforms to the typed contract and only uses the approved access method.
- Fixture ingestion persists searchable canonical records with source provenance.
- Repeated fixture/live input is idempotent.
- Partial and total failures produce correct ingestion-run status and structured redacted errors.
- A bounded authorized live smoke passes when required by the source register.

## Forbidden decisions

- No HTML scraping unless CROSS-002 explicitly approved that documented method.
- No credential in code, fixtures, logs, or evidence.
- No unbounded pagination/retry, generic plugin loader, scheduler, HTTP ingestion-control route, or frontend code.
- No source-specific columns in canonical tables and no bypass of normalization/deduplication.

## Handoff evidence

- Bound source ID and source-register revision
- Adapter contract and field map
- Fixture/license/sanitization note
- Idempotency and partial-failure counts
- Sanitized live-smoke result or explicit unresolved credential gate
- Required-validation transcript

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `development`
- Dispatched at: 2026-08-16T23:00:00-03:00

## Completion record

- Commit: Pending (uncommitted on `development`; not committed because this branch is shared with BACK-007)
- Evidence: See below
- Independent reviewer: Pending

This order is `REVIEW`, not `DONE`.

### Bound source ID and register revision

- Bound source ID: `himalayas` (CROSS-002 mapping in [`docs/sources/v1-source-register.md`](../../sources/v1-source-register.md) §2 / §4.1 / §10).
- Implemented-field notes added to the register §4.1 retrieval paragraph and §10 Himalayas operational notes (disjoint windows including `exclude_worldwide`, page cap, User-Agent, adapter field map). CROSS-002 selection was not reopened.

### Adapter contract and field map

Typed `SourceAdapter` protocol in `job_engine.sources.base` with explicit `get_adapter` registry (no filesystem discovery). HTTP via `httpx` with timeouts, identifying User-Agent, and one retry on 429/transport only. Invocation: `run_ingestion(...)` and `python -m job_engine.ingest himalayas`.

| Canonical input | Himalayas source |
| --- | --- |
| `source_id` / `source_posting_id` | `"himalayas"` / `guid` |
| `application_url` | `applicationLink` |
| title / company | `title` / `companyName` |
| description | `description` |
| location / eligibility | `locationRestrictions` (empty → Worldwide / worldwide) |
| remote evidence | `"remote"` |
| employment / seniority | `employmentType` / joined `seniority` |
| compensation | `minSalary` / `maxSalary` / `currency` / `salaryPeriod` |
| technologies | joined `categories` |
| published_at | `pubDate` (ms, seconds, or ISO) |
| closed | past `expiryDate` on persist |
| raw metadata | `guid`, `companySlug`, `expiryDate`, `categories` (no description) |

### Fixture/license/sanitization note

Fixtures are original sanitized envelopes (not verbatim third-party corpora). `success.json` keeps `guid`, application URL, title, and company; descriptions are short and contain no emails or phones. `malformed.json` is a missing-`guid` reject case. Himalayas JSON API access is public; no credentials.

### Idempotency and partial-failure counts

- Success fixture persist: `inserted_count=3`. Repeat unchanged input: `inserted_count=0`, `updated_count=3`, still 3 source postings / 3 job groups.
- One valid + one malformed: `partial_success`, `accepted_count=1`, `rejected_count=1`, valid row kept; error text has no secrets.
- Observed past `expiryDate` still closes that posting when the run is `partial_success`.
- `FAILURE` / `PARTIAL_SUCCESS` do not increment absence stale. Two consecutive fully `SUCCESS` misses mark remaining active postings `stale` (expired posting stays `closed`). Group precedence `ACTIVE > UNKNOWN > STALE > CLOSED`; `closed_at` only when every linked posting is `closed`.

### Live smoke

`JOB_ENGINE_LIVE_SMOKE=1` bounded run: one worldwide search page (`himalayas_max_pages_per_window=1`, Brazil window not fetched). Credentials: none. Payload not committed.

```text
status=success fetched_count=20 accepted_count=20 rejected_count=0
inserted_count=20 updated_count=0 marked_stale_count=0 marked_closed_count=0
```

### Required-validation transcript

```text
$ docker compose up -d postgres
Container job-engine-postgres-1 Running

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
56 files already formatted

$ cd apps/api && uv run mypy src tests
Success: no issues found in 52 source files

$ cd apps/api && uv run pytest tests/sources tests/services/test_ingestion.py
collected 25 items
24 passed, 1 skipped (live smoke gated)

$ git diff --check
(no whitespace errors)
```

