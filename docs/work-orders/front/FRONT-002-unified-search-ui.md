# FRONT-002: Unified Search and Results UI

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** FRONT-001, BACK-007

**Unblocks:** FRONT-003

**Product spec:** Sections 1, 3, 6.1, 6.2, 6.4, 11, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement the primary `/jobs` search experience against the accepted BACK-007 API: URL-backed parameters, unified grouped results, sorting, pagination, and truthful loading/empty/error states.

## Owned files

- `/apps/web/src/app/page.tsx` (redirect to `/jobs` only)
- `/apps/web/src/app/jobs/page.tsx`
- `/apps/web/src/app/jobs/loading.tsx`
- `/apps/web/src/app/jobs/error.tsx`
- `/apps/web/src/features/jobs/api.ts`
- `/apps/web/src/features/jobs/types.ts`
- `/apps/web/src/features/jobs/search-params.ts`
- `/apps/web/src/features/jobs/components/JobSearchForm.tsx`
- `/apps/web/src/features/jobs/components/ActiveFilters.tsx`
- `/apps/web/src/features/jobs/components/JobResults.tsx`
- `/apps/web/src/features/jobs/components/JobCard.tsx`
- `/apps/web/src/features/jobs/components/Pagination.tsx`
- `/apps/web/src/features/jobs/components/SearchStatus.tsx`
- `/apps/web/src/features/jobs/**/*.test.tsx`
- `/apps/web/src/app/globals.css` (search/results styles only)

## Fixed interaction contract

- Route: `/jobs`; query keys match BACK-007 exactly.
- Initial empty search returns active jobs using backend defaults.
- Search text submits explicitly; filters, sort, and page changes update the URL through accessible controls.
- Changing any query/filter/sort resets `page` to `1`; pagination preserves every other parameter.
- Repeated multi-select values use repeated URL keys, not comma-packed strings.
- Browser back/forward and refresh restore the same state.
- Default sort is `newest`; `compensation_desc` is the only other V1 sort.
- The include-unknown-compensation control defaults to checked/true.
- Result count, active filters, and clear-all action are visible.

## Result-card contract

Render title, company, location, remote status, location-eligibility evidence or `Unknown`, seniority, source badges, technologies, posted date, freshness, compensation, and description excerpt when present. Unknown compensation must read `Compensation not provided`, not `$0`. A grouped card shows every source and uses the backend-selected primary application/detail behavior without hiding provenance.

## Procedure

1. Copy the accepted BACK-007 response shape into narrow frontend types or generate them only if an already accepted repository mechanism exists; do not invent a competing contract tool.
2. Implement one typed API client with explicit handling for validation, network, and non-2xx responses.
3. Parse and serialize URL parameters in pure tested functions, discarding invalid values safely.
4. Fetch filter vocabulary and results from the backend; keep filter interpretation on the backend.
5. Build semantic form controls in the exact V1 order: keywords, role, technologies, remote, eligibility, seniority, compensation, source, posted date, and sort.
6. Implement grouped result cards and deterministic pagination.
7. Implement loading, no-results, and total-error presentations. Partial-source health details belong to FRONT-003, but available catalog results must remain usable.
8. Add tests for initial/default state, every parameter, multi-select OR serialization, cross-category preservation, page reset, back/forward-compatible URL parsing, unknown compensation, grouped sources, empty results, and total error.

## Required validation

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run build
git diff --check
```

## Acceptance criteria

- Every V1 parameter is represented in the URL and sent to BACK-007 with the fixed semantics.
- Refresh/back/forward preserve search state; filter/sort changes reset pagination.
- Results from multiple sources use one consistent card and grouped provenance remains visible.
- Unknown eligibility/compensation are explicit and never presented as negative or zero values.
- Loading, no-results, and total-error states are distinct and accessible.
- Keyboard operation and visible focus work for the full search/results/pagination flow.
- The production build and interaction tests pass.

## Forbidden decisions

- No client-side full-catalog filtering, duplicate merging, eligibility inference, salary normalization, fit score, saved search, application tracking, or analytics.
- No source-specific UI branches except displaying backend-provided source identity.
- No new state-management, form, UI-kit, animation, or data-fetching dependency without a separately approved need.
- No job-details implementation beyond a link to the reserved route.

## Handoff evidence

- Final URL/query mapping table
- Test matrix for each parameter and state
- Desktop/mobile search-results evidence
- Keyboard flow notes
- Required-validation transcript

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending

