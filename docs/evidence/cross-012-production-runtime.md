# CROSS-012 production runtime evidence

**Date:** 2026-08-20  
**Branch:** `development`  
**Approval status:** remains `READY` in `docs/work-orders/STATUS.md` (the Work Order file still says `BLOCKED`; that is stale).

## Production composition

Process-level objects are constructed in `apps/desktop/src/main/index.ts`:

- `new RunnerClient(...)`
- `new LeaseManager(client)`
- `new RuntimeCoordinator({ config, viewManager, client, leaseManager, adapterRegistry: createDefaultAdapterRegistry() })`

Per-run objects are constructed only inside `apps/desktop/src/main/runtime/coordinator.ts`:

- `new StepRunner(...)`
- `new EvidenceRecorder(...)`

```mermaid
flowchart TD
  Index[index.ts] --> Coord[RuntimeCoordinator]
  Coord --> RC[RunnerClient]
  Coord --> LM[LeaseManager]
  Coord --> SR["StepRunner per run"]
  Coord --> ER["EvidenceRecorder per run"]
  Coord --> AR[AdapterRegistry]
  Coord --> ViewMgr[ApplicationViewManager]
  ViewMgr --> WebView[visible WebContentsView]
```

`rg -n "new (StepRunner|LeaseManager|RunnerClient|EvidenceRecorder)" apps/desktop/src/main` locates those construction sites. There is no static import-graph shim; `test:production` launches compiled `dist/main/index.js` and fails if the coordinator is not on that path.

## Production smoke (real Electron, `dist/main/index.js`)

Runs created only via `POST /api/v1/application-runs`. Trusted renderer calls `openApplication` over production IPC.

| Case | Result |
| --- | --- |
| Generic authorized full-auto | submitted |
| Greenhouse authorized full-auto | submitted (`platform_adapter_id=greenhouse`) |
| Lever authorized full-auto | submitted (`platform_adapter_id=lever`) |
| Generic semi-auto | `submit_armed` + view surrender, owner `release-submit`, then submitted |

Identity fields that the answer policy classifies as `unrecognized_intent` pause as `unresolved_question` / `needs_input`. The smoke resolves those through the public `resolve-answers` contract, then reopens the same run. Full-auto still does not call `release-submit`. Semi-auto still requires it.

## Coordinator unit evidence (`tests/runtime/coordinator.test.ts`)

- View refusal at/past submitting (`VIEW_LOCKED_SUBMITTING`)
- Visible URL mismatch (`URL_MISMATCH`)
- Unauthorized full-auto surfaced as `UNAUTHORIZED_FULL_AUTO` (no silent drop)
- Crash while submitting completes `submission_unknown`

Lease loss and step-loop exhaustion are implemented in `coordinator.ts` (`LEASE_LOST`, `STEP_EXHAUSTED`). Duplicate submit uses `submitAlreadyAttempted` → reconcile, never a second activation.

## Semi-auto view surrender (D-1)

At `READY_FOR_REVIEW` in semi-auto the coordinator records `submit_armed`, raises `semi_auto_armed`, forgets the lease, closes the embedded view, and dequeues **other** runs only. Reclaim after `release-submit` uses `claimed`/`running` + `submit_armed` as released (claim changes status off `queued`).

## Isolation / redaction

- ATS `WebContentsView` stays sandboxed, no preload.
- Trusted preload may only `require("electron")`; IPC channel names are inlined so the sandbox can load it.
- Runtime-state IPC carries `runId`, `phase`, `status`, `checkpoint`, `automationMode`, `adapterId`, `reasonCode`, `blockingFieldCount` only.

## Reconciled omissions (not owner decisions)

- `vitest.config.mts` `production` project (D-6) so `tests/production/**` runs.
- `AdapterRegistry.adapterById()` so named `platform_adapter_id` binds when the visible host is loopback.
- Fixture seed `policy_snapshot` so BACK-012 submit gates do not 409 real-backend lifecycle tests.
- Sandboxed preload cannot import `../shared/contracts` at runtime.

## Validation transcript (2026-08-20)

```text
corepack pnpm --filter @job-engine/desktop run check          # pass
corepack pnpm --filter @job-engine/desktop run test           # 289 passed
corepack pnpm --filter @job-engine/desktop run test:fixtures  # 7 passed
corepack pnpm --filter @job-engine/desktop run test:production # 4 passed
corepack pnpm --filter @job-engine/desktop run build          # pass
rg construction sites in apps/desktop/src/main                # index.ts + coordinator.ts
git diff --check                                              # clean
```
