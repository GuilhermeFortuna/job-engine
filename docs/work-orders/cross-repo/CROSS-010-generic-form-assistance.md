# CROSS-010: Generic Embedded Form Assistance Runtime

**Status:** `BLOCKED`

**Owner:** Unassigned

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

Do not edit `/apps/web`, backend domain/API contracts, or platform-specific adapters in this order.

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

```bash
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run test:fixtures -- generic
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

- Normalized field and adapter-contract documentation
- Generic fixture matrix and end-to-end transcript
- Decision/fill/conditional/upload verification examples
- Review/release/one-click/receipt evidence
- Restart, auth, CAPTCHA, hostile-page, and ambiguous-submit evidence
- Full desktop runtime validation transcript

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
