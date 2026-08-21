# CROSS-010: Generic Embedded Form Assistance Runtime

**Status:** `IMPLEMENTING`

**Owner:** Guilherme Fortuna

**Depends on:** CROSS-006, BACK-009, BACK-010, BACK-011

**Unblocks:** CROSS-007, CROSS-008, FRONT-005, CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`

## Objective

Add a browser-neutral normalized form layer and a generic assisted-apply runtime to the Electron main process. The runtime claims one owner-created semi-auto run, observes conventional accessible controls, obtains backend decisions, fills and verifies authorized values, uploads the granted resume, navigates supported intermediate steps, pauses for review, and submits exactly once only after explicit owner release.

## Owned files

- `/apps/desktop/src/main/runtime/runner.ts` (new)
- `/apps/desktop/src/main/runtime/lease.ts` (new)
- `/apps/desktop/src/main/runtime/checkpoints.ts` (new)
- `/apps/desktop/src/main/runtime/evidence.ts` (new)
- `/apps/desktop/src/main/runtime/redaction.ts` (new)
- `/apps/desktop/src/main/forms/types.ts` (new)
- `/apps/desktop/src/main/forms/observe.ts` (new)
- `/apps/desktop/src/main/forms/fill.ts` (new)
- `/apps/desktop/src/main/forms/fingerprint.ts` (new)
- `/apps/desktop/src/main/forms/verify.ts` (new)
- `/apps/desktop/src/main/forms/upload.ts` (new)
- `/apps/desktop/src/main/adapters/contract.ts` (new)
- `/apps/desktop/src/main/adapters/generic.ts` (new)
- `/apps/desktop/src/main/adapters/registry.ts` (new)
- `/apps/desktop/src/shared/contracts.ts` (runtime-state additions only)
- `/apps/desktop/tests/runtime/**` (new)
- `/apps/desktop/tests/forms/**` (new)
- `/apps/desktop/tests/fixtures/generic/**` (new; synthetic/minimal)
- `/docs/development.md` (assisted-runtime commands only)

### Approved backend scope expansion

`POST /api/v1/runner/claims` was blind FIFO with no run ID, so the desktop
runtime could be handed a run the owner never selected, or a `FULL_AUTO` run
this batch must not execute, with no way to hand either back. The owner
approved two additive backend changes on 2026-08-18. Neither alters an
accepted BACK-009/010/011 contract.

- `/apps/api/src/job_engine/api/applications.py` (runner claim/release only)
- `/apps/api/src/job_engine/api/schemas.py` (runner claim/release only)
- `/apps/api/src/job_engine/domain/applications.py` (release reason, audit event, retry counter)
- `/apps/api/src/job_engine/db/models.py` (release record, retry counter)
- `/apps/api/src/job_engine/db/repositories.py` (targeted claim, release, retry accounting)
- `/apps/api/src/job_engine/services/applications.py` (claim/release only)
- `/apps/api/migrations/versions/0005_add_runner_claim_release.py` (new)
- `/apps/api/tests/api/test_runner_claim_release.py` (new)
- `/apps/api/tests/db/test_application_claim_release.py` (new)
- `/apps/desktop/scripts/run-fixtures.mjs` (new; fixture filter forwarding)
- `/apps/desktop/tests/fixtures/backend/**` (new; synthetic seed only)
- `/docs/v2-assisted-apply-spec.md` (runner API list only)

Do not edit `/apps/web`, any other backend behavior, or platform-specific
adapters in this order.

## Reused API contract

Use the implemented endpoints exactly as documented in `docs/v2-assisted-apply-spec.md`. In particular:

- Claim only an existing backend-created run through `POST /api/v1/runner/claims`.
- Reject and release any claimed `FULL_AUTO` run; Batch 03 desktop execution accepts only `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`.
- Keep the runner bearer secret, lease token, and resume grant in Electron main-process memory only.
- Heartbeat and checkpoint through the existing lease protocol.
- Submit normalized observations to `POST /api/v1/runner/runs/{run_id}/answer-decisions` without reimplementing answer policy.
- Fetch the selected PDF only through the single-use resume grant and verify the `X-Resume-Sha256` value against the claimed run.
- At review, checkpoint `SUBMIT_ARMED` and raise the existing `SEMI_AUTO_ARMED` exception.
- Wait for the trusted UI to call `release-submit`; reclaim the same run at `SUBMIT_ARMED` before one-time site submission.
- Reconcile confirmed, ambiguous, and failed outcomes through the existing completion/evidence endpoints.

## Frozen runner claim contracts

### Targeted claim

`POST /api/v1/runner/claims` accepts an optional body `{ "run_id": UUID }`.
With it, the named run is claimed or nothing is; a targeted claim never
substitutes a different run and returns `204` when the run is not claimable.
An absent body preserves the original oldest-queued behavior.

The desktop runtime only ever claims by explicit run ID, and only on two
triggers: the owner opening a run, and a detected `release-submit` for the run
it is already tracking. There is no polling claim loop and nothing claims at
startup, which is what makes a wrong-run claim structurally impossible.

### Claim release

`POST /api/v1/runner/runs/{run_id}/release-claim`, authenticated with the
runner bearer secret, `X-Runner-Lease-Token`, `X-Runner-Id`, and a required
`Idempotency-Key`. Body: `{ "reason": "unsupported_automation_mode" |
"run_not_selected" | "runtime_unavailable" }`. Returns the run.

- Refuses with `409` once `submit_attempted_at` is set or the checkpoint is
  `submitting` -- a run that may have reached the employer is reconciled
  through `complete`, never re-queued -- and for any terminal run.
- On release the run returns to `queued`, the lease is cleared, and every
  unconsumed resume grant is consumed so the released grant token dies with it.
- Replay is authorized by a persisted release record, never by the
  caller-supplied `X-Runner-Id` alone. A replay must match the run, lease token
  hash, runner ID, reason, and `Idempotency-Key`, and the record must not have
  been retired. Every mismatch returns one generic `401`.
- A later claim retires the run's release records, so a release token from a
  prior attempt stops working the moment the run is claimed again.

### Attempt identity and retry budget

`attempt_count` is attempt identity: evidence lives under `attempt_{n}/`,
`store_evidence` rejects a stale attempt, and every event row carries it. It
stays monotonic, so a release never decrements it. Retry budget moved to
`application_runs.retry_failure_count`, which only advances when an attempt
actually fails; a pre-work release therefore consumes no retries. The
`max_retries` threshold is unchanged for existing rows.

## Normalized adapter contract

Each adapter exposes:

- `adapterId`
- exact HTTPS host/path matcher
- `detect`
- `observeStep`
- `fillStep`
- `advance`
- `detectReview`
- `submitAfterRelease`
- `captureReceipt`

Closed runtime outcomes are `PROGRESSED`, `NEEDS_ANSWERS`, `NEEDS_AUTH`, `CAPTCHA`, `UNSUPPORTED`, `READY_FOR_REVIEW`, `SUBMITTED`, `SUBMISSION_UNKNOWN`, `FAILED_RETRYABLE`, and `FAILED_FINAL`.

Observed fields map exactly to the backend `QuestionObservationSchema`. Stable fingerprints use adapter ID, semantic page identity, label/accessibility semantics, control type, and normalized options—not DOM position alone.

The generic adapter supports only conventional visible inputs, textareas, native selects, radio groups, checkboxes, and file inputs with discoverable accessible names. Custom comboboxes, contenteditable fields, canvas/shadow controls, signature widgets, unlabelled required controls, and ambiguous repeated fields pause as `UNSUPPORTED` or `NEEDS_ANSWERS`.

## Recorded deviations

### Isolated-world execution transport

Procedure step 3 names `executeJavaScriptInIsolatedWorld`. In Electron 43 its
signature is `(worldId, scripts: { code: string }[])` -- it accepts source
strings only and cannot carry structured arguments. Using it would force
page-derived values to be interpolated into script source, which this same
order forbids.

The runtime instead creates a dedicated world with CDP
`Page.createIsolatedWorld` and calls the frozen script through
`Runtime.callFunctionOn` with arguments passed **by value**, over the
`webContents.debugger` session the resume upload already requires. The
isolation guarantee is identical and the argument handling is strictly safer.
Hostile payloads -- quotes, backslashes, newlines, U+2028/U+2029, script close
tags, template expressions, command-shaped page text -- are round-tripped in
tests and asserted byte-identical with nothing evaluated.

### Evidence types

This order emits `receipt` and `log` evidence only. `screenshot` and
`dom_snapshot` are deferred: the backend's `sanitize_dom_snapshot` catches
password inputs, card numbers, SSNs, and bearer tokens but not a filled answer,
and `metadata.redaction_applied = true` is a caller's assertion rather than a
proof. Adding them needs pre-capture masking of sensitive controls, guaranteed
restoration, and tests proving known raw values are absent, which belongs in
its own order.

## Mutation and review rules

- Observe before mutating. Re-observe after every fill, upload, conditional reveal, validation response, and page transition.
- Fill only `AUTO_FILL` or `AUTO_FILL_AND_SUBMIT` decisions. Highlight `REVIEW_REQUIRED`; leave `ABSTAIN` unresolved; apply `DECLINE_OPTIONAL` only when the returned option exists exactly.
- Dispatch the browser events required by the control and verify the resulting page-visible value/state. Never report success from an attempted assignment alone.
- Upload only the granted PDF and verify the displayed filename or accepted upload state.
- For file inputs, attach Electron's main-process `webContents.debugger` using the stable `1.3` protocol and call CDP `DOM.setFileInputFiles`. Materialize the verified bytes only in a per-run `mkdtemp` directory under the OS temporary root, use a non-user-derived filename and restrictive permissions, and delete the file/directory immediately after upload verification and in every error/shutdown cleanup path. Fail closed if debugger attach, node resolution, upload, verification, detach, or cleanup fails.
- Never log raw answers, hidden fields, cookies, resume bytes, tokens, or unredacted DOM.
- Intermediate `Continue`/`Next` actions require all currently visible required fields to have verified decisions.
- Final submission is unavailable until the backend run is released and reclaimed at `SUBMIT_ARMED`.
- Activate the final site control once. Never retry after timeout, renderer crash, lost navigation, or ambiguous receipt.

## Procedure

1. Extend the desktop API client with the exact runner lease, decision, resume, evidence, and completion endpoints.
2. Implement the adapter registry and normalized field/fingerprint types independently from Electron APIs.
3. Observe and classify conventional controls with a fixed bundled script executed through `executeJavaScriptInIsolatedWorld`; sanitize all data crossing into the main process and never accept script source from React, the API, or page text.
4. Implement decision requests, verified filling, conditional re-observation, and accessible highlight metadata for the trusted UI.
5. Implement run-scoped PDF retrieval, checksum verification, bounded temporary materialization, CDP `DOM.setFileInputFiles`, page-visible upload verification, debugger detach, and guaranteed cleanup.
6. Implement bounded multi-step progression, heartbeat, checkpoints, exceptions, restart recovery, and same-run resume.
7. Implement prepared-review pause, explicit release detection, one-time submit, receipt capture, and `SUBMISSION_UNKNOWN` handling.
8. Add synthetic fixtures for one-page, multi-page, conditional, validation, file rejection, auth, CAPTCHA marker, popup, unsupported control, malicious page text, restart, confirmed receipt, and ambiguous submit.
9. Prove the form types and adapter contract can be tested without launching Electron; use the real embedded view for fixture integration.

## Required validation

PostgreSQL must be running for the backend suite and the mandatory
real-backend lifecycle fixture: `docker compose up -d postgres`.

```bash
cd apps/api && uv run ruff format --check . && uv run ruff check .
cd apps/api && uv run mypy src tests
cd apps/api && uv run alembic upgrade head && uv run pytest

corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run test:fixtures -- generic
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/desktop run build
git diff --check
```

## Acceptance criteria

- An owner-created synthetic semi-auto run is claimed, displayed, filled across multiple pages, supplied with backend decisions, given the selected PDF, paused visibly for review, explicitly released, submitted once, and reconciled with receipt evidence.
- Medium/low-confidence, missing, sensitive, auth, CAPTCHA, validation, and unsupported cases pause with exact field/context metadata and preserve the same run.
- Conditional fields are discovered after mutation and cannot be skipped by a stale observation set.
- Restart recovery does not repeat a verified fill, upload, completed navigation, or submit attempt.
- Upload tests prove the temporary PDF is absent after success, rejection, debugger detach, renderer crash, cancellation, and desktop shutdown.
- A hostile fixture cannot turn page text into runtime commands, broaden navigation, request arbitrary files, call trusted IPC, or leak secrets into evidence.
- Generic form logic remains browser-neutral and contains no Greenhouse or Lever selectors.

## Forbidden decisions

- Do not accept or execute `FULL_AUTO` runs.
- Do not create jobs/runs, choose a resume, generate policy decisions, or infer backend state in the desktop runtime.
- Do not hardcode applicant values or platform-specific selectors.
- Do not bypass CAPTCHA, auth, rate limits, validation, disabled controls, or unsupported widgets.
- Do not retry an ambiguous submit or mark a click/navigation as submitted without receipt reconciliation.
- Do not expose runner credentials, lease/grant tokens, DOM execution, or filesystem paths through the preload bridge.

## Handoff evidence

Where each required item lives in the repository:

| Evidence | Location |
| --- | --- |
| Normalized field and adapter contract | `apps/desktop/src/main/forms/types.ts`, `apps/desktop/src/main/adapters/contract.ts` |
| Field identity rules and stability | `apps/desktop/src/main/forms/fingerprint.ts`, `apps/desktop/tests/forms/fingerprint.test.ts` |
| Generic fixture matrix (real Electron) | `apps/desktop/tests/fixtures/generic-runtime-runner.ts` (13 cases) |
| End-to-end lifecycle (real backend) | `apps/desktop/tests/fixtures/generic-real-backend.test.ts` (9 cases) |
| Decision, fill, and verification behavior | `apps/desktop/tests/runtime/runner.test.ts`, `apps/desktop/tests/forms/page-script-fill.test.ts`, `apps/desktop/tests/forms/verify.test.ts` |
| Conditional reveal after mutation | `tests/forms/page-script-observe.test.ts`, generic fixture case "discovers conditional fields only after a change" |
| Upload verification and temp-file lifecycle | `apps/desktop/tests/runtime/upload.test.ts`, generic fixture upload cases |
| Review, release, one-time submit, receipt | real-backend cases "arms the submit and pauses", "refuses to submit before the owner releases", "detects the owner release and reclaims", "submits once", "never submits a second time" |
| Restart recovery | `apps/desktop/tests/runtime/checkpoints.test.ts` (`resumePhaseFor`) |
| Auth and CAPTCHA pauses | `apps/desktop/tests/runtime/runner.test.ts`, generic fixture auth/CAPTCHA cases |
| Hostile page isolation | generic fixture case "a hostile page cannot turn its text into commands", `apps/desktop/tests/runtime/isolated-world.test.ts` |
| Ambiguous submit handling | `apps/desktop/tests/runtime/checkpoints.test.ts` (`submitAlreadyAttempted`), `/generic/ambiguous-submit` fixture |
| Secret and answer redaction | `apps/desktop/tests/runtime/redaction.test.ts`, runner test "never writes an answer into the evidence log" |
| Browser neutrality | `apps/desktop/tests/forms/adapter.test.ts`, "keeps the generic runtime free of platform-specific selectors" |
| Backend claim/release contract | `apps/api/tests/api/test_runner_claim_release.py`, `apps/api/tests/db/test_application_claim_release.py` |

## Dispatch record

- Worker: Claude Opus 5 (agent), for Guilherme Fortuna
- Branch/worktree: `development`
- Dispatched at: 2026-08-18

## Completion record

- Commits:
  - `11fe78c` targeted runner claiming and claim release (backend)
  - `e4710f9` browser-neutral normalized form layer
  - `b60c63c` isolated-world transport and runtime foundations
  - `cb9ee91` verified resume upload over CDP
  - `d41552f` step orchestration and evidence recording
  - `0ba1ee1` generic fixture matrix in real Electron
  - `df81db2` mandatory real-backend lifecycle fixture
- Evidence: see the handoff table above. Validation transcript recorded in the
  handoff notes; all suites green (backend 304 passed, desktop 232 unit/form
  tests, 3 Electron fixture suites).
- Independent reviewer: Pending
