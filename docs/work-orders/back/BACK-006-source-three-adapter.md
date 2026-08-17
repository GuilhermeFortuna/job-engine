# BACK-006: Third Approved Source Adapter

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** CROSS-002, BACK-004

**Unblocks:** CROSS-003

**Product spec:** Sections 8, 9, 12, and 16 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement the source mapped to BACK-006 using the accepted BACK-004 adapter contract, adding only genuinely source-specific behavior.

## Dispatch binding gate

Bound source ID: `remoteok` (CROSS-002 ranked `APPROVED_BACKUP`; WWR remains `PENDING_OWNER` because of the open RSS-storage legal gate). Owned file, fixture, and test names use this ID. If this source cannot conform to the accepted adapter contract, stop and propose a separate contract-revision order rather than changing shared files here.

## Owned files

- `/apps/api/src/job_engine/sources/remoteok.py`
- `/apps/api/src/job_engine/sources/registry.py` (one registration only)
- `/apps/api/tests/sources/fixtures/remoteok/success.json`
- `/apps/api/tests/sources/fixtures/remoteok/malformed.json`
- `/apps/api/tests/sources/test_remoteok.py`
- `/apps/api/src/job_engine/config.py` (source settings only)
- `/apps/api/pyproject.toml` and `/apps/api/uv.lock` (source client dependency only if unavoidable)
- `/docs/sources/v1-source-register.md` (implemented-field notes only)

Authorized shared-file exceptions (not Protocol changes): `/apps/api/src/job_engine/services/search.py` (`SOURCE_LABELS` only), `/apps/api/tests/api/test_catalog.py`, and `/apps/api/tests/api/test_jobs_search.py` so enabled-source vocabulary includes `remoteok`. Do not change the adapter Protocol, schema, migrations, or normalization.

## Procedure

1. Bind and recheck the approved source ID, official access method, terms, credential names, rate limits, field gaps, and freshness policy.
2. Add sanitized minimal fixtures under the source-specific directory.
3. Implement bounded fetch/pagination, parsing, canonical mapping, provenance, error classification, and closure/last-seen behavior through the existing contract.
4. Register the adapter explicitly by ID.
5. Test contract conformance, field gaps as unknown, multi-page behavior, malformed-record partial success, total failure, idempotency, and secret redaction.
6. Run one bounded authorized live smoke when the source register requires it; do not commit the response corpus.

## Required validation

```bash
docker compose up -d postgres
cd apps/api && uv run ruff check .
cd apps/api && uv run ruff format --check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run pytest tests/sources/test_contract.py tests/sources/test_remoteok.py tests/services/test_ingestion.py
git diff --check
```

## Acceptance criteria

- Placeholder binding is complete before dispatch.
- Adapter uses the approved access method and existing contract without weakening it.
- Valid records persist with provenance; unsupported values remain unknown.
- Repeated input is idempotent and malformed records produce partial success without losing valid records.
- Required authorized live smoke and all adapter/ingestion regressions pass.

## Forbidden decisions

- Do not modify shared adapter interfaces, domain schema, normalization rules, migrations, or frontend.
- Do not scrape, bypass controls, leak credentials, add unbounded retries, or silently skip rejected records.
- Do not copy patterns from source one when official source-three semantics differ.

## Handoff evidence

- Bound source ID/register revision and field map
- Fixture provenance/sanitization note
- Ingestion/idempotency/error counts
- Sanitized live-smoke result or explicit gate
- Required-validation transcript

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `development` (shared; no dedicated branch)
- Dispatched at: 2026-08-17T00:30:00-03:00

## Completion record

- Commit: this change on shared `development` (no dedicated branch)
- Evidence: See below
- Independent reviewer: Pending

This order is `REVIEW`, not `DONE`.

### Bound source ID and register revision

- Bound source ID: `remoteok` (CROSS-002 ranked `APPROVED_BACKUP` in [`docs/sources/v1-source-register.md`](../../sources/v1-source-register.md) §2 / §4.4 / §10). `weworkremotely` remains `PENDING_OWNER` (RSS-storage legal gate) and is not implemented.
- Implemented-field notes added to register §10 Remote OK operational notes (single `/api` snapshot, skip legal object, User-Agent, adapter field map, salary `0` → unknown, no auto-close). CROSS-002 research conclusions were not rewritten.

### Adapter contract and field map

Typed `SourceAdapter` in `job_engine.sources.remoteok`, registered as `remoteok`. HTTP via `httpx` with timeouts, identifying User-Agent, and one retry on 429/transport only. Invocation: `run_ingestion(...)` and `python -m job_engine.ingest remoteok`. Snapshot has no pagination (`next_cursor` is always `None`). Stale after 3 successful misses via `Settings.stale_after_successful_misses("remoteok")`. Adapter Protocol unchanged.

| Canonical input | Remote OK source |
| --- | --- |
| `source_id` / `source_posting_id` | `"remoteok"` / `id` stringified |
| `application_url` | `url` (fallback `apply_url`) |
| title / company | `position` / `company` |
| description | `description` |
| location / eligibility | native `location` (no Brazil/worldwide inference from remote) |
| remote evidence | `"remote"` |
| employment / seniority | omitted (unknown) |
| compensation | `salary_min` / `salary_max`; `0` or omitted → unknown |
| technologies | joined `tags` |
| published_at | `epoch` seconds or ISO `date` |
| closed | never from this adapter |
| raw metadata | `id`, `slug`, `tags`, `location` (no description / legal blob) |

### Fixture/license/sanitization note

Fixtures are original sanitized arrays (not verbatim third-party corpora). `success.json` keeps a short legal object plus `id`, application URL, title, and company; descriptions are short and contain no emails or phones. `malformed.json` is a missing-`id` reject case. Remote OK JSON access is public; no credentials. Live legal blob was not copied.

### Ingestion/idempotency/error counts

- Success fixture persist: `inserted_count=3`, `marked_closed_count=0`. Repeat unchanged input: `inserted_count=0`, `updated_count=3`, still 3 source postings / 3 job groups.
- One valid + one malformed: `partial_success`, `accepted_count=1`, `rejected_count=1`, valid row kept; error text has no secrets.
- Transport `FAILURE` does not stale. Three consecutive fully `SUCCESS` misses mark remaining active postings `stale`. Remote OK never auto-closes from absence.

### Live smoke

`JOB_ENGINE_LIVE_SMOKE=1` bounded run: one `GET /api` snapshot. Credentials: none. Payload not committed.

```text
status=success fetched_count=100 accepted_count=100 rejected_count=0
inserted_count=100 updated_count=0 marked_stale_count=0 marked_closed_count=0
```

### Required-validation transcript

```text
$ docker compose up -d postgres
Container job-engine-postgres-1 Running

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
60 files already formatted

$ cd apps/api && uv run mypy src tests
Success: no issues found in 56 source files

$ cd apps/api && uv run pytest tests/sources/test_contract.py tests/sources/test_remoteok.py tests/services/test_ingestion.py tests/api/test_catalog.py tests/api/test_jobs_search.py
collected 56 items
53 passed, 3 skipped (live smoke gated)

$ git diff --check
(no whitespace errors)
```

