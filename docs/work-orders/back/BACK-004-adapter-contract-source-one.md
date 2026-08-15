# BACK-004: Adapter Contract and First Approved Source

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-002, BACK-002, BACK-003

**Unblocks:** BACK-005, BACK-006, CROSS-003

**Product spec:** Sections 8, 9, 12, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Define the minimal source-adapter boundary and prove the complete fetch-to-persistence path with the source mapped to BACK-004 in the approved source register.

## Dispatch binding gate

Before this order may change from `BLOCKED` to `READY`, the coordinator must replace `<SOURCE_ONE_ID>` below with the exact lowercase ID mapped to BACK-004 by CROSS-002 and commit that edit. The bound ID determines the exact module, fixture, test, configuration, and documentation names. A worker must not choose or rename the source.

## Owned files

- `/apps/api/src/job_engine/sources/__init__.py`
- `/apps/api/src/job_engine/sources/base.py`
- `/apps/api/src/job_engine/sources/registry.py`
- `/apps/api/src/job_engine/sources/<SOURCE_ONE_ID>.py`
- `/apps/api/src/job_engine/services/ingestion.py`
- `/apps/api/tests/sources/fixtures/<SOURCE_ONE_ID>/success.*`
- `/apps/api/tests/sources/fixtures/<SOURCE_ONE_ID>/malformed.*`
- `/apps/api/tests/sources/test_contract.py`
- `/apps/api/tests/sources/test_<SOURCE_ONE_ID>.py`
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
5. Implement `<SOURCE_ONE_ID>` pagination, parsing, mapping, provenance, rate handling, and closure/last-seen behavior exactly as documented.
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

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending

