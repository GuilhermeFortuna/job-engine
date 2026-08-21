# FRONT-002: Unified Search and Results UI

**Status:** `REVIEW`

**Owner:** Antigravity agent

**Depends on:** FRONT-001, BACK-007

**Unblocks:** FRONT-003

**Product spec:** Sections 1, 3, 6.1, 6.2, 6.4, 11, and 15 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Implement the primary `/jobs` search experience against the accepted BACK-007 API: URL-backed parameters, unified grouped results, sorting, pagination, and truthful loading/empty/error states.

## Owned files

- `/apps/web/src/app/page.tsx` (redirect to `/jobs` only)
- `/apps/web/src/app/page.test.tsx` (test ownership reconciliation for root redirect)
- `/apps/web/src/app/jobs/page.tsx`
- `/apps/web/src/app/jobs/loading.tsx`
- `/apps/web/src/app/jobs/error.tsx`
- `/apps/web/src/app/jobs/page.test.tsx`
- `/apps/web/src/app/jobs/loading.test.tsx`
- `/apps/web/src/app/jobs/error.test.tsx`
- `/apps/web/src/features/jobs/api.ts`
- `/apps/web/src/features/jobs/api.test.ts`
- `/apps/web/src/features/jobs/types.ts`
- `/apps/web/src/features/jobs/search-params.ts`
- `/apps/web/src/features/jobs/search-params.test.ts`
- `/apps/web/src/features/jobs/components/JobSearchForm.tsx`
- `/apps/web/src/features/jobs/components/JobSearchForm.test.tsx`
- `/apps/web/src/features/jobs/components/ActiveFilters.tsx`
- `/apps/web/src/features/jobs/components/ActiveFilters.test.tsx`
- `/apps/web/src/features/jobs/components/JobResults.tsx`
- `/apps/web/src/features/jobs/components/JobResults.test.tsx`
- `/apps/web/src/features/jobs/components/JobCard.tsx`
- `/apps/web/src/features/jobs/components/JobCard.test.tsx`
- `/apps/web/src/features/jobs/components/Pagination.tsx`
- `/apps/web/src/features/jobs/components/Pagination.test.tsx`
- `/apps/web/src/features/jobs/components/SearchStatus.tsx`
- `/apps/web/src/features/jobs/components/SearchStatus.test.tsx`
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

### 1. Final URL / query mapping table

| URL Parameter | Form Control Order & Type | Valid Values / Types | Serialized URL Example | Default / Omitted Value |
| --- | --- | --- | --- | --- |
| `q` | 1. Text input | `string` (trimmed) | `?q=fastapi` | omitted when empty |
| `role_family` | 2. Checkboxes | `software_developer`, `full_stack`, `backend`, `python`, `frontend`, `ai_application`, `applied_ai` | `?role_family=backend&role_family=python` | omitted when empty |
| `technology` | 3. Checkboxes | Canonical terms from `/catalog/filters` | `?technology=Python&technology=React` | omitted when empty |
| `remote_status` | 4. Checkboxes | `remote`, `hybrid`, `onsite`, `unknown` | `?remote_status=remote` | omitted when empty |
| `location_eligibility` | 5. Checkboxes | `brazil`, `latin_america`, `worldwide`, `unknown` | `?location_eligibility=brazil` | omitted when empty |
| `seniority` | 6. Checkboxes | `internship`, `junior`, `mid`, `senior`, `lead_staff`, `unknown` | `?seniority=senior` | omitted when empty |
| `minimum_annual_usd` | 7. Number input | integer `>= 0` | `?minimum_annual_usd=90000` | omitted when empty |
| `include_unknown_compensation` | 7. Checkbox | `boolean` | `?include_unknown_compensation=false` | omitted when `true` (default) |
| `source` | 8. Checkboxes | Enabled sources from `/catalog/filters` (`himalayas`, `jobicy`) | `?source=himalayas` | omitted when empty |
| `posted_within` | 9. Select / Radio | `24h`, `7d`, `30d`, `any` | `?posted_within=7d` | omitted when `any` |
| `sort` | 10. Select | `newest`, `compensation_desc` | `?sort=compensation_desc` | omitted when `newest` |
| `page` | Pagination link | integer `>= 1` | `?page=2` | omitted when `1` |
| `page_size` | Query param | integer `1..100` | `?page_size=50` | omitted when `25` |

### 2. Test matrix for each parameter and state

- **`search-params.test.ts`**:
  - `parseRawSearchParams`: default empty query, single and repeated multi-select keys, record parsing, discarding invalid static enums and malformed numbers, explicit `include_unknown_compensation=false` vs `true`.
  - `validateSearchParams`: pruning dynamic technology, source, and role_family against backend `/catalog/filters` vocabulary.
  - `serializeSearchParams`: repeated keys emission (`append`), explicit `false` serialization for `include_unknown_compensation`, omission of defaults (`page=1`, `sort=newest`, `posted_within=any`), full parameter roundtrip.
  - `updateSearchParams`: resetting `page=1` on filter/keyword/sort updates, parameter preservation on page-only updates.
- **`api.test.ts`**:
  - `searchJobs`: URL construction with repeated keys, JSON parsing, 422 `ApiValidationError` with response details, 5xx `ApiError`, `NetworkError` on network drops.
  - `fetchCatalogFilters`: successful retrieval of `/catalog/filters`, `NetworkError` on failure.
- **`JobCard.test.tsx`**:
  - Canonical job title linked to `/jobs/${job.id}`.
  - Company, location, remote arrangement, seniority, technologies, and excerpt rendering.
  - Location eligibility evidence text with `Unknown` fallback.
  - Missing compensation renders `Compensation not provided` (never `$0`).
  - Both original text and normalized annual USD bounds rendered when available.
  - Grouped source badges showing all provenance (`Himalayas`, `Jobicy`) and primary apply link with `rel="noopener noreferrer"`.
  - Semantic `<time>` tags with ISO datetime.
- **`JobSearchForm.test.tsx`**:
  - Form controls rendered in exact V1 order (1–10).
  - Keyword submit resets `page=1`.
  - Filter checkbox toggle serializes repeated keys and resets `page=1`.
  - `include_unknown_compensation` defaults to checked and serializes `false` when unchecked.
  - Sort select change updates URL and resets `page=1`.
- **`ActiveFilters.test.tsx`**:
  - Null when no active filters.
  - Displays chips for all active parameters.
  - Individual chip dismissal resets `page=1` and updates URL.
  - "Clear all" button navigates to `/jobs`.
- **`SearchStatus.test.tsx`**:
  - `total=0`: `"0 jobs found"`.
  - Single page: `"Showing 1–8 of 8 jobs"`.
  - Multi-page: `"Showing 1–25 of 42 jobs"`, `"Showing 26–42 of 42 jobs"`.
  - Page beyond total: `"Page 5 is beyond available results (10 total jobs)"`.
  - Accessible `role="status"` and `aria-live="polite"`.
- **`Pagination.test.tsx`**:
  - Null when `totalPages <= 1`.
  - Previous disabled on page 1 as non-interactive `<span aria-disabled="true">`.
  - Next disabled on last page as non-interactive `<span aria-disabled="true">`.
  - Current page marked with `aria-current="page"`.
  - Bounded window generation with ellipsis for large result sets.
  - Active query parameter preservation in page links.
- **`JobResults.test.tsx`**:
  - Truthful empty results message.
  - Ordered list rendering of multiple job cards.
- **`page.test.tsx` (app/jobs & root)**:
  - Root `/` redirects to `/jobs`.
  - `/jobs` Server Component composes filters, search status, results, and pagination.
- **`loading.test.tsx` & `error.test.tsx`**:
  - Accessible loading status with `role="status"` and `aria-busy="true"`.
  - Error boundary with `role="alert"`, clear message, guidance, and `reset()` retry button.

### 3. Desktop/mobile search-results evidence

- **Desktop (`>= 64rem / 1024px`)**: 2-column layout with fixed-width search & filter sidebar (19rem) and flexible results area (1fr) inside a 72rem bounded container.
- **Mobile (`< 64rem / 375px–768px`)**: Single-column stacked layout with native accessible `<details className="filters-details-accordion">` drawer for filters, preventing horizontal page overflow and maintaining comfortable tap targets.

### 4. Keyboard flow notes

- Logical DOM tab sequence: Header banner link -> Keyword search input -> Search submit button -> Filter expander / form controls (role family, tech, remote, eligibility, seniority, compensation, source, posted within, sort) -> Active filter dismiss buttons -> Job card links & apply buttons -> Pagination links.
- Focus outlines: High-visibility 2px solid focus ring (`--color-focus: #2563eb`) with 2px offset on all interactive elements via `:focus-visible`.
- Form submission: Pressing `Enter` in the keyword input submits the form cleanly via `onSubmit` (`e.preventDefault()`). Disabled pagination controls use non-interactive `<span>` elements to prevent focus traps.

### 5. Required-validation transcript

```text
$ corepack pnpm --filter @job-engine/web run check
> next typegen && tsc --noEmit && eslint .
Generating route types...
✓ Types generated successfully

$ corepack pnpm --filter @job-engine/web run test
 RUN  v4.1.10 /home/gui/projects/job-engine/apps/web
 Test Files  13 passed (13)
      Tests  64 passed (64)
   Start at  00:55:14
   Duration  1.17s

$ corepack pnpm --filter @job-engine/web run build
▲ Next.js 16.3.1 (Turbopack)
✓ Compiled successfully in 726ms
Route (app)
┌ ○ /
├ ○ /_not-found
└ ƒ /jobs
○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

$ git diff --check
(no whitespace errors)
```

## Dispatch record

- Worker: Antigravity agent
- Branch/worktree: `development`
- Dispatched at: 2026-08-17T00:50:30-03:00

## Completion record

- Commit: Pending
- Evidence: Documented above; all 64 unit/component tests and Next.js production build pass.
- Independent reviewer: Pending
