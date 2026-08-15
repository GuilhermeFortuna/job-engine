# FRONT-003: Job Details, Freshness, and Resilience

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** FRONT-002, BACK-007

**Unblocks:** CROSS-003

**Product spec:** Sections 6.2, 6.3, 15.2, 15.3, and 16 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Complete the V1 browser experience with job details, safe external application links, catalog/source freshness, partial-source-failure communication, responsive refinement, and automated accessibility/browser coverage.

## Owned files

- `/apps/web/src/app/jobs/[jobGroupId]/page.tsx`
- `/apps/web/src/app/jobs/[jobGroupId]/loading.tsx`
- `/apps/web/src/app/jobs/[jobGroupId]/error.tsx`
- `/apps/web/src/app/jobs/[jobGroupId]/not-found.tsx`
- `/apps/web/src/features/jobs/components/JobDetails.tsx`
- `/apps/web/src/features/jobs/components/SourcePostingList.tsx`
- `/apps/web/src/features/jobs/components/CatalogHealthNotice.tsx`
- `/apps/web/src/features/jobs/components/ExternalApplyLink.tsx`
- `/apps/web/src/features/jobs/api.ts` (details/health calls only)
- `/apps/web/src/features/jobs/**/*.test.tsx` (details/resilience tests only)
- `/apps/web/playwright.config.ts`
- `/apps/web/e2e/jobs.spec.ts`
- `/apps/web/package.json` and `/pnpm-lock.yaml` (Playwright/axe test dependencies only)
- `/apps/web/src/app/globals.css` (details/responsive/accessibility refinements only)
- `/docs/development.md` (browser-test commands only)

## Fixed behavior

- Details route: `/jobs/[jobGroupId]` using the BACK-007 group ID.
- The page shows normalized fields, source description content, transformation evidence where provided, every source posting, freshness, and safe external apply links.
- Unsupported/missing values display `Unknown` or a field-specific truthful message; empty fields are not replaced with invented copy.
- External links accept only backend-validated HTTP/HTTPS URLs, open with clear external-site labeling, and use safe new-tab attributes when a new tab is used.
- A missing group uses the not-found state; network/total API failure uses the error state.
- Catalog health warns when one or more latest source runs failed/staled while keeping persisted results usable. It never claims current completeness.
- Source-provided markup is never injected unsanitized with `dangerouslySetInnerHTML`.

## Procedure

1. Implement detail fetching through the existing typed client and route-level loading/error/not-found states.
2. Render a semantic detail hierarchy and provenance list without reinterpreting backend domain values.
3. Render descriptions as safe plain text unless the accepted API contract supplies pre-sanitized supported markup with an explicit renderer/test.
4. Implement external apply links and test rejected/absent URL behavior.
5. Fetch/display catalog health on the search experience using non-blocking partial-failure and staleness notices.
6. Refine search and detail layouts at 360px, 768px, and 1280px widths without horizontal page overflow.
7. Add Playwright coverage for URL-backed search, pagination, details, return navigation, external-link attributes, no-results, partial failure, unknown fields, keyboard traversal, and mobile viewport.
8. Add an automated axe scan for `/jobs` and one populated details view; resolve serious/critical violations rather than suppressing rules.
9. Document deterministic browser-test startup and cleanup; tests must use controlled fixtures/test API state, not mutable public live data.

## Required validation

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run test:e2e
corepack pnpm --filter @job-engine/web run build
git diff --check
```

## Acceptance criteria

- Details show canonical values, provenance, freshness, description, and all original source/application links safely.
- Not-found, loading, total-error, partial-source-failure, stale-catalog, and unknown-field states are distinct and truthful.
- Search remains usable when catalog health reports a failed source.
- Required desktop/mobile widths have no page-level horizontal overflow.
- Keyboard navigation, visible focus, programmatic labels, and status semantics pass human review.
- Axe reports no serious or critical violations on required views.
- Unit, browser, and production-build validations pass using deterministic test data.

## Forbidden decisions

- No application submission, saved jobs, authentication, analytics, notification, AI summary, or fit-scoring feature.
- No client-side HTML sanitization guess if the API contract does not guarantee supported markup; fall back to safe text.
- No disabling accessibility rules, hiding errors, or presenting a partial catalog as fully current.
- No source-specific details layout or source credential exposure.

## Handoff evidence

- Details/source-provenance example
- Partial-failure, stale, unknown, and not-found evidence
- Playwright and axe transcripts
- Desktop/mobile and keyboard review notes
- Required-validation transcript

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
