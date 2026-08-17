# CROSS-004: Live Search End-to-End Integration and Acceptance

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** BACK-008, FRONT-004

**Unblocks:** Batch 02 completion

**Product spec:** Sections 1, 3, 6, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Independently verify the end-to-end Live Search and synchronization experience across the full stack—confirming concurrent multi-source ingestion, real-time SSE event streaming, UI progress feedback, catalog deduplication, and automatic search results refresh.

## Owned files

- `/docs/evidence/live-search-acceptance.md` (new)
- `/docs/work-orders/STATUS.md` (Batch 02 status and acceptance evidence entries only)

## Entry gate

- `BACK-008` and `FRONT-004` are marked `DONE` with passing test suites and recorded evidence.
- Clean database migration and seed data configured.

## Procedure

1. Verify backend SSE endpoint handles concurrent live sync across all three configured sources (`himalayas`, `jobicy`, `remoteok`).
2. Verify rate-limiting and duplicate-request guards prevent rapid repeated live sync executions.
3. Test resilience under partial network degradation (simulate an upstream 429 / timeout on one source).
4. Verify the frontend renders step-by-step progress badges for all sources, announces updates via ARIA live regions, and refreshes the search results table when complete.
5. Verify that existing URL search filters (e.g. keywords, role family, salary, location eligibility) are preserved and correctly filter newly ingested jobs.
6. Run full automated repository checks (`pnpm run check`, `pnpm run test`, `pnpm run build`).
7. Issue `GO` or `NO-GO` recommendation in the acceptance report.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
git diff --check
```

## Acceptance criteria

- End-to-end Live Search flow functions seamlessly in the browser.
- Live progress modal updates dynamically as events stream from the server.
- New postings are visible in the catalog search immediately after sync completes.
- Partial failures do not crash the search or block viewing current results.
- All backend, frontend, and browser E2E test suites pass.

## Forbidden decisions

- No modifying product logic or test assertions inside CROSS-004.
- No accepting the order without manual browser verification.

## Handoff evidence

- End-to-end live sync stream transcript.
- Browser interaction screenshots / video recording / notes.
- Repository test and build execution logs.
- Formal `GO` or `NO-GO` decision.

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
