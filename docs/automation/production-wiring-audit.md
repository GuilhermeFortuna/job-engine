# Auto-Apply Production-Wiring Audit

**Work Order:** CROSS-011

**Audit date:** 2026-08-19

**Repository revision inspected:** `4d52c03`

**Outcome contract:** [Job Engine V2.1 Auto-Apply Owner Outcome Contract](../v2.1-auto-apply-outcome-contract.md)

**Result:** The secure visible Electron surface, backend orchestration, answer
policy, form runtime, evidence recorder, and generic/Greenhouse/Lever adapters
exist, but the production Electron entrypoint does not compose the automation
runtime. End-to-end automation execution is currently test/fixture-only.

Line references below describe revision `4d52c03`; downstream workers must
reconfirm them against their implementation commit.

## 1. Audit method and evidence boundary

This audit separately inspected:

- imports and object construction reachable from
  `apps/desktop/src/main/index.ts`;
- the trusted renderer-to-main IPC and visible `WebContentsView` lifecycle;
- construction of `RunnerClient`, `LeaseManager`, `EvidenceRecorder`,
  `StepRunner`, and the adapter registry across production and tests;
- owner-facing and runner-facing backend routes, durable state, and receipt
  behavior;
- the field-observation-to-answer-decision path and current provider behavior;
- Batch 03 Work Orders, the revised V2 specification, and CROSS-009 evidence.

Unit tests, jsdom tests, mocked bridges, and standalone Electron fixture drivers
are recorded as automated proof. They are not treated as proof that the compiled
production main process executes the same modules.

## 2. Current production path

The reachable production path is:

```text
apps/desktop/src/main/index.ts
  -> loadDesktopConfig()
  -> configureApplicationSession()
  -> new ApplicationViewManager()
  -> registerIpcHandlers()
  -> createMainWindow()
       -> trusted Next.js renderer
       -> OPEN_APPLICATION IPC
       -> fetchApplicationRun(run_id)
       -> ApplicationViewManager.openApplication(run_id, application_url)
       -> visible sandboxed WebContentsView.loadURL(application_url)
```

Evidence:

- `apps/desktop/src/main/index.ts:1-8` imports only the Electron window, config,
  session, IPC, and application-view composition used by production.
- `apps/desktop/src/main/index.ts:13-56` constructs the dedicated session and
  `ApplicationViewManager`, registers IPC, creates the window, and publishes
  sanitized browser state.
- `apps/desktop/src/main/ipc.ts:50-81` validates the trusted sender and UUID,
  resolves the run from the backend, and passes only `runId` plus the
  backend-resolved application URL to the view manager.
- `apps/desktop/src/main/application-view.ts:98-145` validates the target URL and
  creates the sandboxed `WebContentsView` with no preload or Node integration.
- `apps/desktop/src/main/application-view.ts:146-238` contains navigation,
  redirect, popup, load, title, crash, bounds, and visible `loadURL` handling.
- `apps/desktop/src/main/session.ts:4-44` creates the dedicated partition,
  denies permissions and downloads, and confines the test certificate override
  to loopback hosts.

This path proves a visible isolated application browser. It does not claim a
lease, observe a form, request answer decisions, fill a control, attach a
résumé, select an adapter, advance a step, activate submit, upload runtime
evidence, or reconcile a receipt.

## 3. Missing production composition

No file under `apps/desktop/src/main` constructs any of the following:

| Module | Implemented at | Current construction | Production gap |
| --- | --- | --- | --- |
| `RunnerClient` | `apps/desktop/src/main/runtime/runner-client.ts:68-375` | Fixture drivers only | No process-owned runner credentials/client or API lifecycle in `index.ts` |
| `LeaseManager` | `apps/desktop/src/main/runtime/lease.ts:37-160` | Unit and fixture drivers only | No targeted production claim, heartbeat, release, or restart recovery |
| `EvidenceRecorder` | `apps/desktop/src/main/runtime/evidence.ts:21-87` | Unit and fixture drivers only | No production step log or receipt upload |
| `StepRunner` | `apps/desktop/src/main/runtime/runner.ts:232-438` | Unit and fixture drivers only | No production observe/decide/fill/verify/advance loop |
| `createDefaultAdapterRegistry()` | `apps/desktop/src/main/adapters/registry.ts:69-73` | Adapter unit tests only | No production adapter resolution for the visible page |

The current `LeaseManager` is also deliberately Batch 03-only:
`apps/desktop/src/main/runtime/lease.ts:35` binds
`semi_auto_pause_before_submit`, and lines 96-104 release/refuse every other
mode. Production full-auto therefore requires both composition and the
BACK-012 authorization-aware mode change; importing the current manager alone
would still reject `full_auto`.

The current `StepRunner` implements only one step at a time. It observes,
requests backend decisions, fills and verifies values, attaches the résumé,
reports validation/unresolved states, detects review, and advances an
intermediate control (`runner.ts:266-406`). A production coordinator still must
own the multi-step loop, mode-specific `submit_armed` behavior, final activation,
exception mapping, evidence flush, completion, lease loss, close/crash/restart,
and idempotent resume.

### Fixture-only composition

The missing objects are explicitly assembled outside production:

- Generic: `apps/desktop/tests/fixtures/generic-runtime-runner.ts:137-157`.
- Greenhouse real-backend lifecycle:
  `apps/desktop/tests/fixtures/greenhouse/greenhouse-lifecycle-runner.ts:108-157`.
- Lever real-backend lifecycle:
  `apps/desktop/tests/fixtures/lever/lever-lifecycle-runner.ts:102-148`.
- Focused unit construction appears in
  `apps/desktop/tests/runtime/runner.test.ts:268-271` and
  `apps/desktop/tests/runtime/lease.test.ts:62-239`.
- Adapter registry construction appears in
  `apps/desktop/tests/forms/adapter.test.ts:73` and
  `apps/desktop/tests/adapters/adapter-detection-collisions.test.ts:61`.

CROSS-009 proved real Electron and real-backend fixture behavior, but its report
does not show those fixture drivers being reached from the compiled production
`index.ts`. Batch 04 must retain those tests and add production-entrypoint proof.

## 4. Current answer path

The implemented path, when invoked by a fixture-composed runner, is:

```text
adapter.observeStep()
  -> normalized QuestionObservation[]
  -> RunnerClient.answerDecisions()
  -> POST /api/v1/runner/runs/{run_id}/answer-decisions
  -> runner-secret + lease + frozen run-context validation
  -> ApplicationAnswerService.decide()
  -> deterministic policy first
  -> optional AnswerProvider for permitted grounded narrative
  -> evidence/control validation
  -> AnswerDecision[]
  -> StepRunner.planFills()
  -> adapter.fillStep()
  -> re-observe and verify rendered value
  -> unresolved exception or continued eligibility
```

Evidence:

- `apps/desktop/src/main/runtime/runner.ts:289-340` sends observations, plans
  fills from backend decisions, fills, re-observes, and verifies the visible
  state.
- `apps/desktop/src/main/runtime/runner-client.ts:237-265` states that the runner
  supplies observations only and calls the lease-authenticated answer endpoint.
- `apps/api/src/job_engine/api/application_answers.py:104-181` validates the
  runner and lease, loads the frozen run/profile/résumé/answer bank/job evidence,
  authorizes the context, and delegates decisions.
- `apps/api/src/job_engine/services/application_answers.py:433-546` applies
  owner resolutions and deterministic policy before generation.
- `apps/api/src/job_engine/services/application_answers.py:548-580` currently
  derives deterministic `AUTO_FILL_AND_SUBMIT` from `FULL_AUTO` mode.
- `apps/api/src/job_engine/services/application_answers.py:582-710` calls the
  configured provider, validates grounded claims and controls, and currently
  uses a confidence threshold in generated-answer eligibility.

### Provider distinction

| Behavior | Current state | V2.1 binding |
| --- | --- | --- |
| Deterministic | Implemented and default; owner/profile/answer-bank facts precede generation | Retained as policy authority |
| Local | No loopback local provider exists | BACK-013 adds an OpenAI-compatible loopback provider using the shared strict schema; unaccepted revisions are review-only |
| Gemini | Provider and backend-only key path exist; model is hard-coded in `answer_providers.py:235-292` and activation is privacy-gated | BACK-013 makes the model configurable, binds structured schema and evaluation revision, and retains the owner-accepted privacy gate |
| Generated eligibility | Evidence/control checks plus provider confidence currently can yield `AUTO_FILL_AND_SUBMIT` | Server-derived eligibility must additionally require frozen full-auto authorization and an accepted provider/model/prompt evaluation; self-confidence is never sufficient |

The answer service is backend-reachable, but the complete answer path remains
production-unreachable until Electron composes the runtime.

## 5. Visible-product gaps

- `apps/web/src/app/layout.tsx:38-44` renders the product name and theme toggle;
  it has no global Jobs or Applications navigation.
- There is a workspace route at
  `apps/web/src/app/applications/[runId]/workspace/page.tsx`, but no
  `/applications` list/readiness route or `/applications/settings` route.
- `apps/web/src/features/applications/components/ApplicationLauncher.tsx:112-114`
  returns `null` when the desktop bridge is unavailable or the URL is ineligible.
  This silently removes the feature instead of showing one of the three locked
  capability states and a reason.
- `ApplicationLauncher.tsx:124-164` creates exactly one run, while
  `apps/web/src/features/applications/api.ts:288-300` hard-codes
  `semi_auto_pause_before_submit`.
- `ApplicationLauncher.tsx:202-227` tells the owner final submission always
  requires a second action. That is correct Batch 03 history and superseded
  V2.1 behavior for an authorized full-auto run.
- The current desktop capability projection contains only `embeddedBrowser` and
  `platform` (`apps/desktop/src/shared/contracts.ts:1-4`); it has no adapter,
  readiness, runtime-health, or run-progress capability projection.

## 6. Historical reconciliation

| Date/authority | Decision | Status in this audit |
| --- | --- | --- |
| 2026-08-17 CROSS-005 owner decision | Explicitly selected supported-platform jobs should submit automatically without routine review; exceptions pause | Original product intent; not delivered by Batch 03 |
| 2026-08-18 owner pivot and revised V2 spec | One visible semi-auto run; `FULL_AUTO` hidden/rejected; final submit requires trusted `release-submit` | Authoritative and correctly implemented for Batch 03; superseded only for Batch 04 future behavior |
| 2026-08-19 CROSS-009 evidence | `CONDITIONAL_GO` on synthetic evidence; fixture runtime passed; legal/privacy gates and live inspection remained open | Valid Batch 03 evidence; not production full-auto proof |
| 2026-08-19 Batch 04 owner decision | Restore visible owner-selected full-auto, remove routine second click, wire real production Electron, bound AI, and measure broad coverage | Locked by the V2.1 outcome contract; downstream implementation target |

No completed Batch 03 order, status, test, or evidence record should be edited to
pretend it implemented the later Batch 04 outcome.

## 7. Owner-outcome traceability matrix

| Owner outcome | Work Order | Production entrypoint | Implementation file or boundary | Automated proof | Real-Electron proof | Owner-visible proof | Current gap |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1. Applications always visible | FRONT-006 | Trusted renderer from `createMainWindow()` | `apps/web/src/app/layout.tsx`, `/applications` | No dedicated route/navigation proof; FRONT-006 unit and E2E proof required | No compiled-desktop route traversal | None | No navigation or list route |
| 2. Exactly one per-job capability state | FRONT-006 | Job card/detail render plus typed desktop capability | Launcher, job card/detail, desktop IPC projection | Launcher tests prove current hidden/assisted behavior; three-state matrix required | No production capability projection | None | Launcher silently disappears; no typed capability matrix |
| 3. Exact selection and one authorization | BACK-012 | `POST /api/v1/application-runs` from trusted UI | API schema/service/domain/persistence | API tests prove mode is required; exact-text, multi-job, snapshot, and audit tests absent | No production UI authorization trace | None | No `owner_confirmation` or durable authorization field |
| 4. Full-auto submits without second click | CROSS-012 | `apps/desktop/src/main/index.ts` | Production coordinator plus visible view/runtime modules | Runtime and fixture suites prove semi-auto modules; `test:production` absent | CROSS-009 used separate real-Electron fixture drivers | None for full-auto | Runtime modules not constructed; lease rejects full-auto |
| 5. Genuine exceptions pause truthfully | CROSS-012 | Production coordinator runtime-state IPC | Coordinator, `StepRunner`, backend exceptions/state | Runtime/fixture tests cover several outcomes; full production lifecycle matrix absent | Fixture-only exception/crash evidence | Batch 03 workspace only | Step outcomes exist, but no production lifecycle maps them |
| 6. No autonomous/fabricated/bypass/blind retry behavior | BACK-012 | Create/claim/checkpoint/complete state machine | Backend authorization, idempotency, attempt and terminal-state guards | Existing domain/repository/fixture tests cover selection, leases, duplicates, and ambiguity; authorization cases absent | Fixture restart/ambiguity only | No V2.1 walkthrough | Existing safeguards exist; frozen authorization and production proof absent |
| 7. Readiness, queue, state, mode, audit, receipt visible | FRONT-006 | `/applications` | React routes, API projections, SSE/runtime state | Per-run workspace unit/E2E tests exist; list/readiness/grouping tests absent | Workspace fixture evidence only | Batch 03 per-run workspace only | Only per-run workspace exists |
| 8. Ordinary-browser fallback is safe and explanatory | FRONT-006 | Browser-rendered Next.js app | Job actions, Applications routes, external fallback | Capability tests prove the current launcher disappears; explanatory fallback tests absent | No desktop/browser comparison | None | Current launcher returns `null` |
| 9. Bounded deterministic-first local/Gemini answers | BACK-013 | Runner answer-decisions API | Answer provider/service/config/evaluation corpus | Existing answer-service tests cover deterministic/provider failures; shared corpus and accepted-revision gate absent | No production runner answer trace | None | Local provider and accepted-revision gate absent; confidence currently influences eligibility |
| 10. Visible embedded Chromium and broad measured coverage | CROSS-014 | Production coordinator operating `ApplicationViewManager` view | Inventory, adapters, registry, isolated-world contracts | Generic/Greenhouse/Lever adapter and fixture tests exist; inventory calculation absent | Real Electron is fixture-only | No coverage UI evidence | No production composition or frozen inventory measurement |

Each outcome has one primary implementation owner. Dependencies may supply
contracts, but they do not split acceptance ownership.

## 8. Required downstream production proof

The downstream orders must preserve these evidence layers separately:

1. **Automated contract proof:** backend/unit/React/adapter/fixture coverage.
2. **Production reachability proof:** import and construction evidence from the
   compiled Electron main entrypoint, with real API/database events.
3. **Real-Electron behavior:** the visible embedded surface performs the same
   generic and ATS scenarios.
4. **Owner-visible proof:** named commit, launch command, selected synthetic
   scenario, expected labels, screenshots/video, and owner decision.

No layer substitutes for another. A production-path test that imports a separate
fixture coordinator rather than the application entrypoint fails layer 2.

## 9. Audit conclusion

Batch 03 produced useful, safety-conscious components and genuine real-Electron
fixture evidence. The missing product is composition and visibility, not a lack
of modules. BACK-012 and BACK-013 must first bind authorization and provider
eligibility; CROSS-012 must then compose the runtime in production; FRONT-006
must expose the locked product; CROSS-014 must measure coverage; and CROSS-013
must independently prove all four evidence layers.

This audit is documentation, not runtime proof. CROSS-011 must remain pending
owner review until the exact contract revision is accepted, and no downstream
status changes are authorized by this file.
