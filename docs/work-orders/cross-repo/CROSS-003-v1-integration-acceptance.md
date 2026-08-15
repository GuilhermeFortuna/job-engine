# CROSS-003: V1 Integration and Product Acceptance

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** BACK-004, BACK-005, BACK-006, BACK-007, FRONT-003

**Unblocks:** V1 completion

**Product spec:** Sections 1, 3, 6, 15, 16, and 19 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Independently verify the complete V1 search-and-aggregation flow using all three approved sources, record product evidence, and decide whether V1 satisfies its specification. This order is an acceptance gate, not a feature-development allowance.

## Owned files

- `/docs/evidence/v1-acceptance.md` (new)
- `/docs/work-orders/STATUS.md` (Batch 01 status/evidence entries only)

Defect fixes must be returned to the owning Work Order or handled by a new scoped order; they may not be hidden inside CROSS-003.

## Entry gate

- Every dependency is `DONE`, not merely in `REVIEW`.
- The approved source register still identifies the same three primaries and their current access constraints have been rechecked.
- A named commit is supplied for acceptance.
- Required source credentials, if any, are available through the documented secret mechanism.

## Procedure

1. Record the commit, environment, browser(s), database state, runtime versions, and approved source IDs.
2. From a clean local database, run migrations and ingest representative authorized records from all three sources. Record per-source run counts and freshness without copying credentials or unnecessary descriptions.
3. Re-run unchanged ingestion and prove source-posting/job-group counts do not grow incorrectly.
4. Exercise one malformed-record fixture and one unavailable-source condition; verify partial success and persisted search availability.
5. Execute every V1 search parameter, AND/OR combination rule, both required sorts, pagination, and URL restoration.
6. Verify remote status and location eligibility remain separate and that unknown eligibility is visibly represented.
7. Verify missing/unsupported compensation remains unknown and behaves correctly with both states of the include-unknown control.
8. Exercise same-source duplicates, cross-source duplicates, similar distinct roles, and reposted roles; inspect retained provenance and original links.
9. Verify job details, external links, closed/stale exclusion, catalog freshness, loading, no-results, partial-failure, and total-error states.
10. Run keyboard-only and responsive checks at mobile and desktop widths. Confirm labels, focus visibility, status semantics, and absence of color-only communication.
11. Run the repository check/test/build commands and record exact output.
12. Map each V1 acceptance criterion to evidence and issue `GO` or `NO-GO`. Any unmet criterion produces `NO-GO` and names the owning follow-up order.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
git diff --check
```

Also execute the documented backend migration, ingestion, and frontend browser-test commands established by completed dependency orders.

## Acceptance criteria

- Evidence covers all twelve criteria in V1 spec Section 16 against the named commit.
- All three approved sources contribute successfully normalized records to one UI.
- Idempotency, partial failure, freshness, unknown-state truthfulness, deduplication, filtering, URL state, and external links are demonstrated.
- Automated backend/frontend checks and the production build pass.
- A human keyboard/responsive/product-flow review passes.
- The evidence report contains an explicit `GO`; otherwise Batch 01 remains incomplete.

## Forbidden decisions

- Do not fix product code, alter migrations, relax assertions, or rewrite fixtures in this order.
- Do not accept fixture-only evidence as proof that all three approved live integrations operate when the source register requires authorized live verification.
- Do not treat a successful ingestion message as proof that searchable persisted records exist.
- Do not mark Batch 01 complete on automated tests alone.
- Do not expose source credentials or copyrighted full-description corpora in evidence.

## Handoff evidence

- Named commit and environment inventory
- Per-source ingestion and idempotency counts
- Automated command transcripts
- Acceptance-criterion evidence matrix
- Human accessibility/responsive review notes
- Explicit `GO` or `NO-GO` with defect ownership

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
