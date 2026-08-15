# BACK-006: Third Approved Source Adapter

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-002, BACK-004

**Unblocks:** CROSS-003

**Product spec:** Sections 8, 9, 12, and 16 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement the source mapped to BACK-006 using the accepted BACK-004 adapter contract, adding only genuinely source-specific behavior.

## Dispatch binding gate

Before status becomes `READY`, the coordinator must replace `<SOURCE_THREE_ID>` with the exact CROSS-002 mapping and commit that edit. If this source cannot conform to the accepted adapter contract, stop and propose a separate contract-revision order rather than changing shared files here.

## Owned files

- `/apps/api/src/job_engine/sources/<SOURCE_THREE_ID>.py`
- `/apps/api/src/job_engine/sources/registry.py` (one registration only)
- `/apps/api/tests/sources/fixtures/<SOURCE_THREE_ID>/success.*`
- `/apps/api/tests/sources/fixtures/<SOURCE_THREE_ID>/malformed.*`
- `/apps/api/tests/sources/test_<SOURCE_THREE_ID>.py`
- `/apps/api/src/job_engine/config.py` (source settings only)
- `/apps/api/pyproject.toml` and `/apps/api/uv.lock` (source client dependency only if unavoidable)
- `/docs/sources/v1-source-register.md` (implemented-field notes only)

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
cd apps/api && uv run pytest tests/sources/test_contract.py tests/sources/test_<SOURCE_THREE_ID>.py tests/services/test_ingestion.py
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

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending

