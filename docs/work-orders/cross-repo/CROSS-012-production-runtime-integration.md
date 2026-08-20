# CROSS-012: Production Electron Automation Runtime Integration

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-011, BACK-012

**Unblocks:** CROSS-014, CROSS-013

**Product contract:** [V2.1 Auto-Apply Owner Outcome Contract](../../v2.1-auto-apply-outcome-contract.md), sections 3–5

**CROSS-011 audit:** [Production-Wiring Audit](../../automation/production-wiring-audit.md), sections 2–3 and outcomes 4–5

## Objective

Connect the already implemented lease, form, answer, résumé, evidence, and ATS automation modules to the real Electron production entrypoint. The desktop application must execute explicitly selected full-auto and assisted runs through the same production `WebContentsView` the owner sees; fixture-only composition is not acceptance.

## Owned files

- `/apps/desktop/src/main/index.ts`
- `/apps/desktop/src/main/application-view.ts`
- `/apps/desktop/src/main/ipc.ts` (lifecycle/status channels only)
- `/apps/desktop/src/main/runtime/coordinator.ts` (new)
- `/apps/desktop/src/main/runtime/lease.ts`
- `/apps/desktop/src/main/runtime/runner.ts`
- `/apps/desktop/src/main/runtime/checkpoints.ts`
- `/apps/desktop/src/main/runtime/runner-client.ts`
- `/apps/desktop/src/main/runtime/evidence.ts`
- `/apps/desktop/src/main/adapters/{contract,generic,greenhouse,lever}.ts` (production integration only)
- `/apps/desktop/src/shared/contracts.ts` (runtime-state IPC only)
- `/apps/desktop/tests/runtime/**` (integration-owned cases only)
- `/apps/desktop/tests/production/**` (new)
- `/apps/desktop/scripts/run-production-smoke.mjs` (new)
- `/apps/desktop/package.json` (production-smoke script only)

Do not edit backend semantics, React UI, source ingestion, unrelated Electron security policy, or weaken existing fixtures.

## Fixed production composition

- `apps/desktop/src/main/index.ts` constructs one production runtime coordinator with `RunnerClient`, `LeaseManager`, `EvidenceRecorder`, form transport, adapter selection, résumé grant loader, and `StepRunner`.
- `ApplicationViewManager` exposes only the bounded production hooks required for the coordinator to observe and operate the current run's `WebContentsView`; remote content receives no preload, IPC, filesystem, token, or Node access.
- Opening an application resolves the backend run, verifies that it matches the trusted UI request and visible URL, loads the page, selects generic/Greenhouse/Lever behavior, and starts or resumes that exact run.
- Only one run owns the embedded view at a time. Additional owner-created runs remain queued and are processed deterministically when the view becomes available; no run is selected autonomously.
- `FULL_AUTO` is supported only when BACK-012 reports valid frozen authorization. It submits directly after verified completion and no blocking exception. `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` still pauses until `release-submit`.
- A final submit control is activated at most once. After any attempt, restart/reclaim reconciles receipt or `SUBMISSION_UNKNOWN` and never clicks again.
- Close, route change, logout/auth pause, renderer crash, desktop restart, lease loss, and network failure release or preserve state according to the backend contract without orphaned work.
- Runtime progress and actionable failures are sent to the trusted renderer through typed, redacted state; the UI never receives lease/runner/grant tokens.

## CROSS-011 binding

- The audited production entrypoint currently constructs only configuration,
  session, `ApplicationViewManager`, IPC, and the main window. This order must
  make `apps/desktop/src/main/index.ts` the explicit owner of one coordinator
  that constructs `RunnerClient`, `LeaseManager`, `EvidenceRecorder`,
  `StepRunner`, isolated-world transport, résumé loader, and
  `createDefaultAdapterRegistry()`; fixture imports are forbidden.
- The only automatic start/resume triggers are an owner-opened exact run ID, a
  trusted full-auto run created by the owner and dequeued when the single visible
  view becomes available, or explicit owner resolution/resume. The coordinator
  never performs discovery or chooses a job.
- Before mutation, claim the exact run and validate visible URL, mode, lease,
  frozen authorization, and adapter capability. Bind the adapter to the same
  `WebContentsView` exposed by `ApplicationViewManager`; no hidden browser or
  second automation page may be introduced.
- Map missing answers/validation/unsupported controls to `needs_input`, auth and
  CAPTCHA to `paused_auth`, pre-submit transient failures to the existing retry
  contract, and post-attempt ambiguity to terminal `submission_unknown`.
- At `submit_armed`, semi-auto waits for `release-submit`; authorized full-auto
  records `submitting` and activates the final control once. Receipt evidence is
  reconciled before `submitted`, and restart/reclaim never repeats activation
  after `submit_attempted_at` or `submitting`.
- Extend typed IPC only with redacted runtime health, capability, run progress,
  and exception reason codes consumed by FRONT-006. Do not expose runner secret,
  lease/grant token, cookies, raw answers, résumé path, or remote-page data.
- `test:production` must launch the compiled real main entrypoint, create the run
  through the public contract, and fail if production construction is removed.

## Procedure

1. Use the CROSS-011 audit to enumerate every missing production dependency and lifecycle hook.
2. Implement a coordinator with explicit construction and disposal from `main/index.ts`; do not hide production composition in test helpers.
3. Bind the live `WebContentsView` to isolated-world form transport and exact adapter selection.
4. Implement full-auto versus semi-auto submission branching from backend-authorized state.
5. Bind queue/reclaim/restart/exception/crash handling and redacted runtime-state IPC.
6. Add a production smoke harness that launches the compiled real main entrypoint against a disposable API/database and local HTTPS ATS fixture. It must create the run through the public API/UI contract and prove production modules emit backend progress/receipt events.
7. Retain existing unit and fixture suites, then run the full desktop checks.

## Required validation

```bash
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/desktop run test:production
corepack pnpm --filter @job-engine/desktop run build
rg -n "new (StepRunner|LeaseManager|RunnerClient|EvidenceRecorder)" apps/desktop/src/main
git diff --check
```

## Acceptance criteria

- The compiled production Electron entrypoint constructs and disposes the real automation runtime.
- A real visible `WebContentsView` run performs observe, decide, fill, verify, résumé upload, intermediate navigation, submit, and receipt reconciliation through production code.
- Authorized full-auto submits without a routine final click; semi-auto still requires release.
- Greenhouse, Lever, and generic selection use the production coordinator rather than fixture-specific drivers.
- Exceptions, lease loss, crash/restart, duplicates, and submission ambiguity fail safely without replaying submission.
- The production smoke test fails if runtime construction is removed from the production import graph.
- Remote-page isolation and redaction guarantees remain intact.

## Forbidden decisions

- Do not count fixture-driver construction as production integration.
- Do not expose Electron, IPC, tokens, local paths, cookies, or backend credentials to remote pages or React.
- Do not execute unselected jobs or accept arbitrary renderer-provided application URLs.
- Do not make full-auto mean blind filling, CAPTCHA bypass, fabricated answers, or submit retry.
- Do not replace the existing backend state machine with Electron-local truth.
- Do not weaken existing tests to accommodate the integration.

## Handoff evidence

- Production composition diagram and exact entrypoint references
- Full-auto and semi-auto production traces
- Generic, Greenhouse, and Lever real-Electron production-smoke results
- Exception, crash/restart, lease-loss, and ambiguous-submit evidence
- Isolation/redaction checks and complete validation transcript

## Dispatch record

- Worker: Cursor agent
- Branch/worktree: `development` (shared working branch)
- Dispatched at: 2026-08-20

## Completion record

- Commit: Pending owner commit
- Evidence: `/docs/evidence/cross-012-production-runtime.md`
- Independent reviewer: Pending
