# FRONT-008 implementation plan: Profile-aware batch control

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Specification:** [`../specs/FRONT-008-profile-aware-search-batch-control-spec.md`](../specs/FRONT-008-profile-aware-search-batch-control-spec.md)  
**Depends on:** BACK-014, BACK-016, BACK-017, CROSS-016

## Current-system context

Job cards/details use ambiguous `primary_application_url` and a per-job
`ApplicationLauncher`. The launcher creates one run and owns its own modal. The
Applications page lists individual runs; the Electron bridge projects one runtime
state. Product metadata still calls the tool software-development-specific.

## Implementation decisions

- Add a profile-keyed `ApplicationSelectionProvider` at the Jobs route boundary.
  Store ordered target IDs in `sessionStorage` under profile ID and revalidate on
  every catalog response and batch preview. URL search/filter state remains
  unchanged.
- Backend `preferred_application_target` is the only capability authority. React
  maps its state/reason to actions and never parses URL hosts for automation.
- Replace per-card creation modal with selection controls and one global tray.
  Direct single-job Auto Apply is the same batch path with one selected item.
- Applications routes become profile-scoped projections without putting profile
  IDs in URLs; the active-profile provider supplies scope and route guards.

## Ordered implementation

1. Update jobs/application TypeScript schemas and fetchers for listing/target,
   profile, batch, worker-pool, preview, cancellation, and SSE contracts. Reject
   malformed capability states rather than falling back to Auto Apply.
2. Remove software-only metadata/copy and audit role-family/technology rendering
   so technology remains optional. Add non-engineering fixtures throughout job
   card/results/details tests.
3. Add selection provider, accessible row/card toggles, select-visible, clear,
   session persistence, stale-target pruning, active-profile reset, and live
   count announcements. Only executable targets enter selection.
4. Replace `ApplicationLauncher` with a capability action component: executable
   selection/one-item batch, assisted path, or external link. Show stable backend
   reason text for unresolved/unsupported/desktop-unavailable states.
5. Build the persistent selection tray and authorization dialog. Fetch preview on
   open, show exact profile/avatar, resume/version, ordered jobs/providers, mode,
   known exceptions/duplicates, and confirmation revision; block any issue and
   never silently drop an item.
6. Submit one batch request, handle optimistic/stale/duplicate failures inline,
   clear only accepted selection, and navigate to
   `/applications/batches/{batchId}`.
7. Refactor `/applications` into profile-scoped batch groups plus worker-pool and
   readiness summaries. Add batch detail with immutable authorization, derived
   counters, per-item status/receipt/exception, allowed cancel/resolve actions,
   and links to the selected run workspace.
8. Update workspace/desktop bridge to select/attach one pool run by ID while
   displaying other runs' progress. Reconcile SSE/IPC updates with fetched durable
   state after reconnect and on visibility change.
9. Preserve ordinary-browser behavior: profile/search/history work, external
   links work, and executable targets show the desktop prerequisite rather than
   hiding or opening an empty workspace.

## Validation

- Unit/component tests cover capability mapping, non-software jobs, ordered
  selection, pagination/filter persistence, profile reset, stale pruning,
  preview issues, exact request, duplicate override, and safe external URLs.
- Batch/control-center tests cover mixed states, one-run exception isolation,
  cancellation, receipt ownership, SSE/IPC ordering, reconnect, and browser-only
  fallback.
- Playwright covers software and non-software search, aggregator vs ATS actions,
  multi-page selection, one-item and multi-item authorization, two concurrent
  runs, exception intervention, restart/reload, profile switch, keyboard flow,
  and responsive layout in browser and Electron harnesses.

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run test:e2e
corepack pnpm --filter @job-engine/web run build
corepack pnpm --filter @job-engine/desktop run test:production
```

## Completion evidence

Provide target/action matrix, exact authorized batch request/response with private
values redacted, concurrent progress screenshots/video, ordinary-browser proof,
accessibility results, and validation output. A success toast is not batch or
submission proof; durable state and receipts are required.
