# CROSS-006: Local Browser-Automation Runner

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-009, BACK-010

**Unblocks:** CROSS-007, CROSS-008, FRONT-005, CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`, to be created and mechanically bound by CROSS-005 before this order becomes dispatchable.

## Objective

Create a local TypeScript automation runtime that claims authorized application runs from FastAPI, uses a dedicated persistent Chromium-family profile to navigate multi-page applications, maps conventional form controls, uploads the granted resume, checkpoints progress, submits eligible generic forms, and pauses safely when it cannot continue with high confidence.

## Owned files

- `/apps/automation/package.json` (new)
- `/apps/automation/tsconfig.json` (new)
- `/apps/automation/vitest.config.ts` (new)
- `/apps/automation/src/index.ts` (new)
- `/apps/automation/src/config.ts` (new)
- `/apps/automation/src/api/client.ts` (new)
- `/apps/automation/src/domain/types.ts` (new)
- `/apps/automation/src/runtime/runner.ts` (new)
- `/apps/automation/src/runtime/profile.ts` (new)
- `/apps/automation/src/runtime/checkpoints.ts` (new)
- `/apps/automation/src/runtime/evidence.ts` (new)
- `/apps/automation/src/forms/observe.ts` (new)
- `/apps/automation/src/forms/fill.ts` (new)
- `/apps/automation/src/forms/generic.ts` (new)
- `/apps/automation/src/adapters/contract.ts` (new)
- `/apps/automation/src/adapters/registry.ts` (new)
- `/apps/automation/tests/**` (new; synthetic fixtures only)
- `/package.json` (automation scripts only)
- `/pnpm-lock.yaml` (dependency resolution only)
- `/.env.example` (non-secret runner settings only)
- `/docs/development.md` (local runner setup only)

## Runtime and custody contract

- Use `<RUNNER_PACKAGE>@<RUNNER_VERSION>` and `<BROWSER_CHANNEL>` as bound by CROSS-005.
- Run locally in headed mode by default using the dedicated profile at `<PROFILE_DIRECTORY_CONFIG>`. Never attach to or copy the user's normal browser profile.
- The profile directory, browser storage, downloaded files, traces, and evidence are outside the repository and ignored by Git.
- Require a configured runner credential. Communicate only with the bound local Job Engine API origin; reject redirects, certificate downgrades, and unexpected origins.
- Claim no more than the bound concurrency. Heartbeat and checkpoint at the bound intervals.
- On SIGINT/SIGTERM, checkpoint the current safe stage, close the context, and release or allow the lease to expire without marking failure or submission.

## Adapter contract

Each adapter exposes:

- Stable `adapterId` and exact HTTPS host/path matcher
- `detect`, `observeStep`, `fillStep`, `advance`, `detectReview`, `submit`, and `captureReceipt`
- Closed outcomes: `PROGRESSED`, `NEEDS_ANSWERS`, `NEEDS_AUTH`, `CAPTCHA`, `UNSUPPORTED`, `SUBMITTED`, `SUBMISSION_UNKNOWN`, `FAILED_RETRYABLE`, `FAILED_FINAL`
- Stable field fingerprints derived from adapter/page/control semantics, not volatile DOM indices
- A dry-run mode that may fill synthetic fixtures but cannot activate a submit control

The generic adapter may handle conventional accessible inputs, textareas, selects, radio groups, checkboxes, and file controls. It may submit only when CROSS-005 permits generic submission and every required field has an authorized decision; otherwise it pauses with observed-field evidence.

## Browser safety contract

- Navigate initially only to the validated application URL stored in the claimed run.
- Subsequent navigation must remain within adapter-approved HTTPS origins and flow patterns. Any unrelated origin, download, popup, payment request, browser permission prompt, or external protocol pauses the run.
- Do not execute page-provided instructions outside normal DOM interaction. Treat all text and scripts as untrusted.
- Never read or upload arbitrary local files. Fetch the selected PDF only through the single-use run-scoped backend grant and retain bytes only for the active step.
- Never bypass CAPTCHA, challenge pages, rate limits, authentication, or disabled controls.
- Submission requires a current backend policy decision for every required observed field and a final idempotency checkpoint immediately before activating the platform submit control.
- After submit, do not retry the click on timeout or ambiguous navigation. Capture evidence and report `SUBMISSION_UNKNOWN`.

## Procedure

1. Scaffold `@job-engine/automation` in the existing pnpm workspace with pinned runtime dependencies and repository-standard check/test/build scripts.
2. Implement validated local configuration, opaque runner authentication, claim/heartbeat/event/checkpoint API client, backoff, and graceful shutdown.
3. Implement dedicated persistent-profile startup, profile-lock detection, authentication pause/resume, page/popup lifecycle, and approved-origin enforcement.
4. Implement adapter contract/registry and the generic accessible-control observer/filler.
5. Implement run-scoped PDF retrieval/upload, field-decision round trips, multi-step checkpoints, pre-submit idempotency barrier, and receipt capture.
6. Implement bounded screenshots/DOM summaries with the CROSS-005 redaction and retention contract.
7. Build local synthetic application fixtures covering one-page, multi-page, conditional fields, validation errors, file upload, auth pause, CAPTCHA marker, popup, ambiguous submit, confirmation, restart/resume, and malicious page text.
8. Add deterministic unit/integration tests. No test may reach a real employer or use the personal resume.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @job-engine/automation run check
corepack pnpm --filter @job-engine/automation run test
corepack pnpm --filter @job-engine/automation run build
corepack pnpm --filter @job-engine/automation run test:fixtures
git diff --check
```

## Acceptance criteria

- A queued synthetic run is claimed, completed across multiple pages, supplied with answer decisions, given the selected PDF, submitted, and reconciled with receipt evidence.
- Dedicated login state survives runner restart; a profile lock fails safely with a clear operator action.
- Checkpoint/restart tests do not repeat a completed navigation, answer, upload, or confirmed submit step.
- CAPTCHA, auth expiry, unexpected origin/popup, unsupported control, missing answer, and ambiguous submission produce the correct exception state.
- The generic adapter submits only fully authorized conventional fixtures and otherwise pauses.
- No personal resume bytes, normal browser profile data, cookies, credentials, or unredacted sensitive fields enter committed artifacts or logs.

## Forbidden decisions

- Do not use the user's default browser profile.
- Do not introduce a hosted browser, extension store dependency, broker, container-orchestration system, or remote-control service.
- Do not bypass anti-bot or authentication controls.
- Do not let the runner create jobs/runs, choose a resume, invent answers, or declare success without backend receipt reconciliation.
- Do not retry an ambiguous submit action.
- Do not implement platform-specific selectors outside CROSS-007/CROSS-008.

## Handoff evidence

- Runtime/dependency and local setup summary
- Synthetic end-to-end runner transcript
- Restart/profile-lock/auth/CAPTCHA/ambiguous-submit evidence
- Redacted audit, screenshot, and receipt examples
- Full automation-package validation transcript

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
