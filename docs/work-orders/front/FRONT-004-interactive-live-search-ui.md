# FRONT-004: Interactive Live Search and Progress Feedback UI

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** FRONT-003, BACK-008

**Unblocks:** CROSS-004

**Product spec:** Sections 6.1, 6.2, and 15.3 of [V1 Product Specification](../../v1-product-spec.md)

## Objective

Build the user-facing Live Search capability on top of the SSE sync endpoint (`BACK-008`), featuring an intuitive "Live Search" trigger, real-time multi-source progress indicators, accessible live region announcements, and automatic search results refresh upon sync completion.

## Owned files

- `/apps/web/src/features/jobs/components/LiveSearchButton.tsx` (new)
- `/apps/web/src/features/jobs/components/LiveSyncProgressModal.tsx` (new)
- `/apps/web/src/features/jobs/hooks/useLiveSync.ts` (new)
- `/apps/web/src/features/jobs/api.ts` (live sync SSE client helper only)
- `/apps/web/src/features/jobs/types.ts` (sync event and stage types only)
- `/apps/web/src/features/jobs/components/LiveSearch.test.tsx` (new)
- `/apps/web/src/features/jobs/components/SearchBar.tsx` (or SearchForm integration)
- `/apps/web/e2e/live-search.spec.ts` (new)

## Fixed UI & Interaction Contract

1. **Trigger:**
   - A dedicated "Live Search" button or toggle located alongside the primary search form / catalog health banner.
   - Triggers the live sync flow while preserving currently selected filter parameters in the URL state.

2. **Progress Feedback:**
   - Displays a non-blocking modal or inline progress tray while the SSE stream is active.
   - Shows individual progress items for each configured source (e.g. Himalayas, Jobicy, Remote OK) with status badges:
     - ⏳ *Connecting / Fetching...*
     - ⚙️ *Normalizing & Deduplicating...*
     - ✅ *Done (X new postings)*
     - ⚠️ *Failed / Rate limited (with retry option)*
   - Summary status showing total new postings discovered and catalog update status.

3. **Results Refresh & Accessibility:**
   - Automatically executes a fresh search query against `/api/v1/jobs` with the current filters once sync finishes.
   - Uses `aria-live="polite"` regions and accessible focus management so screen reader users are kept informed of sync progression.
   - Supports keyboard dismissal (Escape) and graceful background completion if the user navigates away.

## Procedure

1. Implement typed SSE stream parser in `apps/web/src/features/jobs/api.ts` consuming `POST /api/v1/catalog/live-sync`.
2. Create `useLiveSync` hook managing SSE connection lifecycle, per-source state machines, and completion callbacks.
3. Build `LiveSyncProgressModal` / tray component rendering source progress badges, progress bar, and error summaries.
4. Integrate `LiveSearchButton` into the search controls and catalog health notice area.
5. Add unit tests for `useLiveSync` and UI components using mocked EventSource/fetch streams.
6. Add Playwright E2E tests simulating live sync progression, partial failure warning, and result list refresh.

## Required validation

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run test:e2e
corepack pnpm --filter @job-engine/web run build
git diff --check
```

## Acceptance criteria

- "Live Search" trigger successfully opens the live sync stream and visualizes per-source progress in real time.
- All sources update their status independently as progress events arrive.
- Active filters and keyword queries in URL state remain intact and automatically re-query the catalog after sync completion.
- Partial failure on one source displays a clear warning banner without crashing the search UI.
- Accessible focus handling, ARIA live region announcements, and responsive layouts (360px–1280px) pass validation.

## Forbidden decisions

- No polling loops when SSE streaming is supported.
- No clearing or resetting user filter selections during or after live sync.
- No blocking the entire UI from viewing existing cached results while sync runs.
- No hardcoded source IDs; source list must come dynamically from the backend stream / catalog metadata.

## Handoff evidence

- Screenshot / ASCII walkthrough of the live progress modal across stages.
- Partial-failure UX evidence.
- Playwright transcript for live sync and automatic result refresh.
- Axe / accessibility validation report.

## Dispatch record

- Worker: Unassigned
- Branch/worktree: Unassigned
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
