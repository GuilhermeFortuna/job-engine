# CROSS-009: Embedded Assisted Apply End-to-End Acceptance

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** BACK-009, BACK-010, BACK-011, CROSS-006, CROSS-010, CROSS-007, CROSS-008, FRONT-005

**Unblocks:** Batch 03 completion

**Product spec:** `docs/v2-assisted-apply-spec.md`

## Objective

Independently determine whether Batch 03 delivers a secure and trustworthy embedded application workspace: one owner-selected job, visible assisted completion, actionable review, explicit owner release, one-time submission, recoverable session state, and truthful receipt or uncertainty across generic, Greenhouse, and Lever flows.

## Owned files

- `/docs/evidence/embedded-assisted-apply-acceptance.md` (new)
- `/docs/evidence/embedded-assisted-apply/**` (new; redacted synthetic or explicitly authorized evidence only)
- `/docs/work-orders/STATUS.md` (acceptance evidence/decision entries only; owner controls status)

No product implementation, dependency, fixture expectation, selector, threshold, personal profile/resume, or approval status is owned by this order.

## Entry gate

- Every dependency is `DONE` in `docs/work-orders/STATUS.md` with required evidence.
- Electron, Chromium, Node, pnpm, Python, and PostgreSQL versions are recorded.
- A disposable database plus synthetic applicant/resume/job fixtures is configured.
- Desktop user-data and evidence roots are outside the repository and contain no normal browser profile.
- Platform register host patterns and evidence are current for both primary adapters.
- Owner authorization names each live inspection target. Any live final submission additionally names the exact desired job or authorized test environment.
- If `LEGAL-GATE-ATS-001` is unresolved, run synthetic tests and authorized visual/non-submitting inspection only; report the production gate honestly.
- If `PROVIDER-PRIVACY-001` is unresolved, use deterministic decisions and report generated-answer coverage as conditional.

## Acceptance scenarios

### A. Desktop isolation and lifecycle

1. Launch the existing Next.js UI inside Electron and open an API-resolved synthetic application in `WebContentsView`.
2. Verify remote content has no Node, Electron, preload, IPC, token, backend, arbitrary file, or normal-browser-profile access.
3. Exercise navigation, redirect, nested-frame, popup, download, permission, external-protocol, and lookalike-origin attempts; all unapproved paths fail closed.
4. Resize, scroll, collapse panels, change scale, navigate away/back, close/reopen, crash the remote renderer, and restart Electron; bounds, disposal, and dedicated session recovery remain correct.

### B. Generic assisted flow

1. Launch one `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` run from an eligible job and selected synthetic PDF.
2. Complete a multi-page conventional fixture with conditional fields and upload verification while the form remains visible.
3. Inspect field values, confidence, policy, provenance, reason, and unresolved counts against backend decisions.
4. Resolve a missing/review-required answer, resume the same run, and prove completed fills/navigation/uploads are not replayed.
5. Reach `SUBMIT_ARMED`; verify no submission occurs until the trusted owner action calls `release-submit`.
6. Activate release once, capture a confirmed receipt, and reconcile `SUBMITTED`.
7. Repeat with ambiguous navigation and verify `SUBMISSION_UNKNOWN` plus no second click.

### C. Platform adapters

1. Complete the full Greenhouse synthetic assisted flow including conditional/custom fields, resume, review, release, and receipt.
2. Complete the materially independent Lever synthetic flow and collision tests.
3. Trigger each adapter's challenge, validation, upload rejection, DOM drift, unsupported variant, and lookalike detection cases.
4. Perform owner-authorized live non-submitting visual inspections for both platform families, stopping before final submission unless separately authorized.

### D. State, safety, and presentation

1. Trigger missing profile, review-required/sensitive question, auth, CAPTCHA, unexpected origin, validation error, unsupported control, provider timeout, cancellation, runner disconnect, and resume/restart paths.
2. Verify duplicate active/submitted run rejection and audit a separately explicit duplicate override without accidental submission.
3. Attempt to create/expose `FULL_AUTO` through desktop UI/bridge; prove it is unavailable and a claimed full-auto run fails closed.
4. Inspect API, desktop, renderer, evidence, and fixture output for secrets, cookies, runner/lease/grant tokens, raw sensitive values, absolute resume paths, or personal data.
5. Manually verify keyboard/focus flow, live announcements, contrast, reduced motion, the 1280x720 minimum workspace, browser bounds, and ordinary web-browser external-link fallback.

## Procedure

1. Re-read the current specification, status board, security model, platform register, and every dependency handoff.
2. Verify clean installation, migrations, loopback-only services, desktop configuration, and absence of personal artifacts from Git.
3. Execute the full synthetic matrix and record exact commands, versions, results, artifact hashes, and deviations.
4. Manually inspect browser isolation, visible field behavior, submitted values, resume checksum, answer provenance, exceptions, restart recovery, and receipts.
5. Execute only authorized live inspections/submissions and clearly separate synthetic, inspection, and actual-submission evidence.
6. Run full repository validation and accessibility/browser review.
7. Write `GO`, `CONDITIONAL_GO`, or `NO_GO`. Synthetic success can establish Batch 03 functional acceptance; production platform readiness remains conditional wherever legal/provider/live evidence gates are open.
8. Report defects to their owning order. Do not repair product code or weaken assertions inside acceptance scope.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/web run test:e2e -- embedded-application-workspace.spec.ts
git ls-files docs/resume | rg -v 'README.md|\.template\.|\.example\.' && exit 1 || true
git diff --check
```

## Acceptance criteria

- The trusted UI and untrusted embedded page remain isolated under hostile fixture testing.
- Generic, Greenhouse, and Lever fixtures complete visibly through review and owner-released confirmed submission.
- No Batch 03 desktop/UI path creates or executes `FULL_AUTO` or a background multi-job queue.
- Every final submit requires an explicit trusted-UI release and activates the remote control at most once.
- Exceptions retain the same run/session and never silently invent, omit, or submit unresolved required values.
- Restart recovery does not replay verified steps; duplicates and ambiguous outcomes cannot be blindly retried.
- `SUBMITTED` appears only with backend-reconciled receipt evidence; unknown remains visibly non-success.
- No secret, cookie, personal fixture, resume byte/path, token, or unredacted sensitive answer appears in committed evidence or logs.
- Automated checks and manual desktop, accessibility, bounds, and authorized live-inspection evidence are independently recorded.

## Forbidden decisions

- Do not modify implementation, fixtures, selectors, policies, or assertions to manufacture a pass.
- Do not perform unauthorized live form mutation or submission, fabricate an applicant, or apply to an unselected job.
- Do not promote fixture-only results to production ATS support.
- Do not mark ambiguity as success or retry a submit attempt.
- Do not expose personal profile/resume material in evidence.
- Do not change any approval status without owner instruction.

## Handoff evidence

- Formal `GO`, `CONDITIONAL_GO`, or `NO_GO` report
- Desktop isolation/navigation/lifecycle matrix
- Generic, Greenhouse, and Lever scenario matrix with artifact hashes
- Field/review/release/receipt and ambiguous-submit evidence
- Exception, restart, duplicate, and full-auto-rejection evidence
- Authorized live-inspection/submission scope and outcomes
- Accessibility, bounds, full repository, and desktop validation transcripts

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
