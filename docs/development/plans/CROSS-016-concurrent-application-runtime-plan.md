# CROSS-016 implementation plan: Concurrent application runtime

**Status:** Draft  
**Specification:** [`../specs/CROSS-016-concurrent-application-runtime-spec.md`](../specs/CROSS-016-concurrent-application-runtime-spec.md)  
**Depends on:** BACK-015, BACK-017

## Current-system context

`apps/desktop/src/main/index.ts` constructs one `ApplicationViewManager`, one
`RuntimeCoordinator`, and one `LeaseManager`. The coordinator has an in-memory
queue and `busy` flag. Backend claiming already enforces a configurable global
limit, but its default and the production desktop composition are one.

## Implementation decisions

- Preserve `RuntimeCoordinator` as the one-run state machine. Add a `WorkerSlot`
  composition and `RuntimeWorkerPool` that own multiple coordinators rather than
  making the coordinator itself multiplex mutable state.
- A slot ID is stable for the process (`desktop-production-runner-1` through the
  effective limit). Each slot receives a distinct Electron persistent partition
  `persist:job-engine-worker-<n>` and its own view/session/lease/client identity.
- The pool polls/claims oldest backend queue work when idle, reconciles on SSE or
  a short bounded wake-up timer, and never relies on the renderer to keep work
  moving. Backend remains queue authority.
- `ApplicationViewManager` supports attach/detach of its existing view from the
  main window. Detach hides without closing. One selected slot supplies browser
  and runtime IPC projection; pool summary exposes all safe run phases.

## Ordered implementation

1. Extend desktop configuration validation and capability contracts with desired
   and effective worker count (`1..4`, default `2`). Add a backend runtime-config
   response or startup handshake so the pool clamps to the server claim limit and
   reports mismatches.
2. Refactor session creation to accept a worker partition and configure the same
   navigation, permission, download, storage, popup, certificate, and redaction
   policy independently on every partition.
3. Add `runtime/worker-pool.ts` and `runtime/worker-slot.ts`. Compose each slot
   with a distinct view manager, client runner ID, lease manager, adapter registry,
   and coordinator. Keep per-run resume/evidence/session objects slot-local.
4. Add backend-driven dequeue/claim lifecycle, fairness, shutdown, slot release,
   retained-intervention slots, and pool health projection. Remove the production
   coordinator's in-memory multi-run queue after the pool owns dispatch.
5. Refactor main entrypoint and IPC handlers to construct the pool, select one
   visible run, route every command by run ID, reject worker/run mismatches, and
   continue sending per-run and pool-state events.
6. Update preload/renderer bridge schemas without exposing session partitions,
   filesystem details, leases, or secrets.
7. Integrate BACK-015 only through backend answer requests; assert no model client
   or process exists in a worker slot.
8. Preserve crash/submission reconciliation per slot and add restart discovery of
   queued/reclaimable work from the real backend.

## Validation

- Unit-test pool clamping, fair dispatch, stable IDs, slot isolation, retained
  exception capacity, cancellation, shutdown, visibility switching, and IPC
  mismatch rejection.
- Run two- and four-worker fixture matrices mixing Greenhouse, Lever, generic,
  auth/CAPTCHA pause, unsupported control, renderer crash, and
  submission-unknown. Assert profile/resume/evidence/receipt identity per run.
- Extend production smoke to construct the pool from compiled `dist/main/index.js`
  with the real backend and prove two simultaneous progressing runs plus restart.
- Run race-focused backend claim tests at and above the configured global limit.

```bash
corepack pnpm --filter @job-engine/api run check
corepack pnpm --filter @job-engine/api run test
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/desktop run test:production
corepack pnpm --filter @job-engine/desktop run build
```

## Completion evidence

Include a sanitized concurrent timeline with slot/run/batch IDs, configured and
effective limits, isolation assertions, restart/reconciliation trace, compiled
entrypoint proof, and validation results. Fixture concurrency alone is not
production acceptance.

