# BACK-005: Second Approved Source Adapter

**Status:** `REVIEW`

**Owner:** Cursor agent

**Depends on:** CROSS-002, BACK-004

**Unblocks:** CROSS-003

**Product spec:** Sections 8, 9, 12, and 16 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement the source mapped to BACK-005 using the accepted BACK-004 adapter contract, adding only genuinely source-specific behavior.

## Dispatch binding gate

Bound source ID: `jobicy` (CROSS-002 mapping). Owned file, fixture, and test names use this ID.

## Owned files

- `/apps/api/src/job_engine/sources/jobicy.py`
- `/apps/api/src/job_engine/sources/registry.py` (one registration only)
- `/apps/api/tests/sources/fixtures/jobicy/success.json`
- `/apps/api/tests/sources/fixtures/jobicy/malformed.json`
- `/apps/api/tests/sources/test_jobicy.py`
- `/apps/api/src/job_engine/config.py` (source settings only)
- `/apps/api/pyproject.toml` and `/apps/api/uv.lock` (source client dependency only if unavoidable)
- `/docs/sources/v1-source-register.md` (implemented-field notes only)

Authorized shared-file exception (not a Protocol change): `/apps/api/src/job_engine/services/ingestion.py` and `/apps/api/tests/services/test_ingestion.py` for source-aware `stale_after_successful_misses` (Himalayas=2, Jobicy=3). Do not change the adapter Protocol, schema, migrations, or normalization.

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
cd apps/api && uv run pytest tests/sources/test_contract.py tests/sources/test_jobicy.py tests/services/test_ingestion.py
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
- Do not copy patterns from source one when official source-two semantics differ.

## Handoff evidence

- Bound source ID/register revision and field map
- Fixture provenance/sanitization note
- Ingestion/idempotency/error counts
- Sanitized live-smoke result or explicit gate
- Required-validation transcript

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `development` (shared; no dedicated branch)
- Dispatched at: 2026-08-17T00:13:00-03:00

## Completion record

- Commit: this change on shared `development` (no dedicated branch)
- Evidence: See below
- Independent reviewer: Pending

This order is `REVIEW`, not `DONE`.

### Bound source ID and register revision

- Bound source ID: `jobicy` (CROSS-002 mapping in [`docs/sources/v1-source-register.md`](../../sources/v1-source-register.md) §2 / §4.2 / §10).
- Implemented-field notes added to the register §4.2 retrieval paragraph and §10 Jobicy operational notes (three latest-100 windows, pinned slugs, User-Agent, adapter field map, no auto-close). CROSS-002 selection was not reopened.

### Adapter contract and field map

Typed `SourceAdapter` in `job_engine.sources.jobicy`, registered as `jobicy`. HTTP via `httpx` with timeouts, identifying User-Agent, and one retry on 429/transport only. Invocation: `run_ingestion(...)` and `python -m job_engine.ingest jobicy`.

Shared-file exception: `_mark_stale_absences` reads `Settings.stale_after_successful_misses(source_id)` (`himalayas`=2, `jobicy`=3). Adapter Protocol unchanged.

| Canonical input | Jobicy source |
| --- | --- |
| `source_id` / `source_posting_id` | `"jobicy"` / integer `id` stringified |
| `application_url` | `url` |
| title / company | `jobTitle` / `companyName` |
| description | `jobDescription` |
| location / eligibility | `jobGeo` (`Anywhere` is worldwide evidence) |
| remote evidence | `"remote"` |
| employment / seniority | joined `jobType` / `jobLevel` except `"Any"` |
| compensation | optional `salaryMin` / `salaryMax` / `salaryCurrency` / `salaryPeriod` |
| technologies | HTML-unescaped `jobIndustry` |
| published_at | ISO `pubDate` |
| closed | never from this adapter |
| raw metadata | `id`, `jobSlug`, `jobIndustry`, `jobGeo`, `jobLevel` (no description) |

### Fixture/license/sanitization note

Fixtures are original sanitized envelopes (not verbatim third-party corpora). `success.json` keeps `id`, application URL, title, and company; descriptions are short and contain no emails or phones. `malformed.json` is a missing-`id` reject case. Jobicy JSON API access is public; no credentials.

### Ingestion/idempotency/error counts

- Success fixture persist: `inserted_count=3`, `marked_closed_count=0`. Repeat unchanged input: `inserted_count=0`, `updated_count=3`, still 3 source postings / 3 job groups.
- One valid + one malformed: `partial_success`, `accepted_count=1`, `rejected_count=1`, valid row kept; error text has no secrets.
- Transport `FAILURE` does not stale. Three consecutive fully `SUCCESS` misses mark remaining active postings `stale`. Himalayas remains stale after 2 successful misses.
- Group precedence unchanged: `ACTIVE > UNKNOWN > STALE > CLOSED`; Jobicy never auto-closes from absence.

### Live smoke

`JOB_ENGINE_LIVE_SMOKE=1` bounded run: one window (`jobicy_max_windows=1`, `jobicy_count=10`, brazil pull). Credentials: none. Payload not committed.

```text
status=success fetched_count=10 accepted_count=10 rejected_count=0
inserted_count=10 updated_count=0 marked_stale_count=0 marked_closed_count=0
```

### Required-validation transcript

```text
$ docker compose up -d postgres
Container job-engine-postgres-1 Running

$ cd apps/api && uv run ruff check .
All checks passed!

$ cd apps/api && uv run ruff format --check .
58 files already formatted

$ cd apps/api && uv run mypy src tests
Success: no issues found in 54 source files

$ cd apps/api && uv run pytest tests/sources/test_contract.py tests/sources/test_jobicy.py tests/services/test_ingestion.py
collected 32 items
30 passed, 2 skipped (live smoke gated)

$ git diff --check
(no whitespace errors)
```
