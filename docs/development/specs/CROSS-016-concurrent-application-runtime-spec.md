# CROSS-016: Concurrent desktop application worker pool

**Status:** Draft  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Depends on:** BACK-015, BACK-017  
**Implementation plan:** [`../plans/CROSS-016-concurrent-application-runtime-plan.md`](../plans/CROSS-016-concurrent-application-runtime-plan.md)

## Purpose

Evolve the single-view Electron coordinator into a configurable local worker
pool so multiple authorized applications can progress concurrently without
mixing profiles, pages, resumes, evidence, leases, or receipts.

## Requirements

- The desktop runtime owns a worker pool with configurable concurrency from `1`
  through `4`, default `2`. The backend claim limit and desktop pool size use the
  same effective value and never exceed the configured maximum.
- Each worker owns its own persistent-partition browser session, hidden or
  visible `WebContentsView`, coordinator state, lease manager, adapter instance,
  resume bytes, evidence recorder, and run context. Mutable objects are never
  shared between workers.
- Queue dispatch is durable-backend-driven, oldest authorized queued item first,
  with stable batch/item order. Workers claim untargeted next work when idle;
  explicit owner opening attaches to the existing worker rather than duplicating
  a run.
- Exactly one worker may be visible in the application workspace at a time.
  Switching visibility does not suspend hidden workers, replace their pages, or
  transfer IPC commands. Commands carry run/worker identity and are rejected on
  mismatch.
- A genuine exception pauses only its run and releases its worker for other safe
  queue work after persisting state. Authentication/CAPTCHA pages that require
  owner interaction retain their isolated page until resolved or cancelled and
  count against concurrency.
- Submission attempt, ambiguous outcome, crash, lease expiry, retry budget,
  cancellation, and receipt reconciliation preserve existing one-shot and
  fail-closed guarantees independently per worker.
- All AI requests go through BACK-015's shared backend broker. A browser worker
  never starts or loads a model process.
- Runtime health exposes configured/active/idle worker counts and sanitized
  per-run phases. Restart resumes claimable work from persisted checkpoints; it
  never replays a recorded submission blindly.

## Public and IPC contracts

- Desktop capability adds worker-pool readiness, configured/effective limit,
  active run summaries, and a selected visible run ID.
- IPC commands for open, close, bounds, navigation, exception resolution, and
  runtime state include `runId`; sender validation and current-run validation
  remain mandatory.
- Backend claim semantics enforce the global limit transactionally across runner
  IDs. A worker has a stable per-process ID suffix and one active lease at most.

## Constraints and non-goals

- Concurrency is bounded local parallelism, not distributed execution.
- No multi-window UI, headless CAPTCHA solving, access-control bypass, account
  sharing, or automatic authentication is introduced.
- Provider-specific throttling may reduce effective concurrency but cannot
  silently exceed it.

## Acceptance criteria

1. Two Greenhouse/Lever fixture applications can make concurrent progress and
   finish with the correct profile snapshot, resume checksum, evidence, and
   receipt attached to each run.
2. Pausing or crashing one worker does not stop, corrupt, or reassign another
   worker's run.
3. UI visibility switching and IPC mismatch tests prove a command cannot control
   another run's view.
4. Effective concurrency respects limits across backend claims, desktop workers,
   retained exception views, and restart.
5. Submission-unknown and already-attempted runs are reconciled without a second
   blind submit under concurrent load.

