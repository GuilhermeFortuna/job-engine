# CROSS-005: High-Automation Application Feasibility and V2 Specification

**Status:** `READY`

**Owner:** Unassigned

**Depends on:** CROSS-004

**Unblocks:** BACK-009, BACK-010, BACK-011, CROSS-006, FRONT-005

**Product direction:** Project-owner decision recorded in `docs/work-orders/STATUS.md` on 2026-08-17. This order creates the successor specification; it must not rewrite the accepted V1 baseline.

## Objective

Turn the owner-approved high-automation direction into an evidence-backed, executable V2 contract. The target experience is: the owner selects one or more jobs in Job Engine, the system completes and submits supported applications without a routine final-review step, captures confirmation evidence, and pauses only for a genuine exception.

This is a research, spike, and specification order. It may create disposable local prototypes under `/tmp`, but it must not add application, dependency, lockfile, database, or browser-profile changes to the repository.

## Owned files

- `/docs/v2-assisted-apply-spec.md` (new)
- `/docs/automation/platform-register.md` (new)
- `/docs/automation/security-model.md` (new)
- `/docs/work-orders/back/BACK-009-applicant-data-vault.md` (binding updates only)
- `/docs/work-orders/back/BACK-010-application-orchestration-audit.md` (binding updates only)
- `/docs/work-orders/back/BACK-011-grounded-application-answering.md` (binding updates only)
- `/docs/work-orders/front/FRONT-005-application-automation-control-center.md` (binding updates only)
- `/docs/work-orders/cross-repo/CROSS-006-browser-automation-runner.md` (binding updates only)
- `/docs/work-orders/cross-repo/CROSS-007-first-platform-automation.md` (binding updates only)
- `/docs/work-orders/cross-repo/CROSS-008-second-platform-automation.md` (binding updates only)
- `/docs/work-orders/cross-repo/CROSS-009-automated-application-acceptance.md` (binding updates only)
- `/docs/work-orders/README.md`, `/docs/work-orders/STATUS.md`, and the three Work Order directory indexes (Batch 03 binding/status dependency updates only)

## Fixed product baseline

The V2 specification must preserve all of these owner decisions:

1. A user-approved job or selected queue may proceed through final submission automatically on supported platforms.
2. Normal successful runs do not require a second final-review click.
3. The runner fills multi-step forms, uploads the selected resume, answers supported questions, submits, and captures a receipt or equivalent confirmation evidence.
4. Human attention is exception-driven: expired authentication, CAPTCHA, unsupported controls, missing required information, an unapproved sensitive answer, or confidence below the bound threshold.
5. The runner never chooses jobs autonomously in Batch 03. Every run originates from an explicit user selection in Job Engine.
6. The initial runtime direction is a local TypeScript browser-automation application under `/apps/automation`, using a dedicated persistent Chromium-family profile. Evaluate Playwright first; replace it only if first-party evidence and a bounded spike demonstrate a material blocker.
7. PostgreSQL/FastAPI owns applicant data, run state, answer policy, idempotency, and audit truth. The automation runtime owns browser interaction. Next.js owns control, progress, and exception-resolution presentation.
8. Local personal resume artifacts remain ignored by Git and must never be copied into fixtures, logs, screenshots, or committed test evidence.

## Required research and binding decisions

### Automation runtime

Compare a Playwright persistent-context runner, a Chromium Manifest V3 extension, and a hybrid design using current first-party documentation. Record:

- Authentication and session continuity
- Multi-page navigation and popup handling
- File-upload support
- Browser-profile custody and locking
- Headed/headless constraints and bot-detection exposure
- Pause/resume after process or browser restart
- Screenshot/DOM evidence and redaction
- Installation, update, and local-development behavior

Bind exact values for `<RUNNER_PACKAGE>`, `<RUNNER_VERSION>`, `<BROWSER_CHANNEL>`, `<PROFILE_DIRECTORY_CONFIG>`, and the backend-to-runner transport. The transport must be local, authenticated, bounded, and must not introduce a broker or workflow platform.

### Application platforms

Evaluate at least four material ATS/application-platform families using first-party terms, privacy information, technical documentation where available, and harmless non-submitting inspection. For each candidate record:

- Stable lowercase adapter ID and recognized HTTPS host/path patterns
- Login/account requirements and session behavior
- Single-page versus multi-page flow
- Standard, custom, conditional, and repeated question behavior
- Resume/file-upload behavior
- CAPTCHA or anti-automation controls
- Submission confirmation mechanism
- Whether the intended automation is permitted, prohibited, ambiguous, or requires explicit owner/legal acceptance
- Test-fixture and authorized-live-test strategy
- Decision: `APPROVED_PRIMARY`, `APPROVED_BACKUP`, `RESEARCH_ONLY`, or `REJECTED`

Select exactly two primary platform families and at least one backup. Bind `<PRIMARY_ATS_ONE_ID>` to CROSS-007 and `<PRIMARY_ATS_TWO_ID>` to CROSS-008. Do not treat two branded employer sites on the same ATS family as two platforms.

### Answering and submission policy

Define a closed field-policy matrix with at least:

- `VERIFIED_PROFILE`: may fill and submit from an explicit applicant value
- `APPROVED_REUSABLE`: may fill and submit from an owner-approved answer-bank entry
- `GROUNDED_GENERATED`: may fill and submit only when the answer cites applicant/resume evidence and meets the bound confidence threshold
- `REVIEW_REQUIRED`: must pause for the owner
- `DECLINE_OPTIONAL`: may intentionally leave an optional question unanswered
- `PROHIBITED_AUTOMATION`: must never be answered or accepted automatically

Bind the generated-answer provider/model or explicitly bind a deterministic-only implementation. Define retention, cost, timeout, privacy, and failure behavior. Legal attestations, work authorization, sponsorship, compensation, demographic/EEO, disability, veteran status, background-check consent, and signature-equivalent statements must have explicit per-field policies; absence of a policy is not permission.

### Reliability and evidence

Bind:

- Default runner concurrency and queue limit
- Per-platform retry limit and retryable/non-retryable stages
- Duplicate-submission idempotency key and reset authority
- Maximum run duration and step timeout
- Required receipt evidence and redaction rules
- Screenshot/DOM retention duration and storage location
- Live gate using only a genuine job the owner explicitly wants to apply to or an explicitly authorized test environment
- `GO`, `CONDITIONAL_GO`, and `NO_GO` acceptance meanings

## Procedure

1. Inspect the current API, web application, local resume boundary, V1/V2 status authority, and package tooling.
2. Research current first-party browser-automation documentation and at least four ATS platform families. Record URLs and retrieval dates.
3. Run harmless disposable spikes for persistent login, multi-step navigation, file upload, restart/resume, and confirmation detection. Do not submit an application or use personal resume bytes in a public fixture.
4. Produce the platform register and security model, including a data-flow diagram and threat table covering path traversal, token replay, cross-origin requests, malicious job pages, prompt injection, secret leakage, overbroad browser control, and evidence retention.
5. Write `docs/v2-assisted-apply-spec.md` with the fixed product baseline, contracts, non-goals, acceptance outcomes, and exact bound values.
6. Replace every Batch 03 placeholder named above in downstream orders, registry entries, and validation commands. Update each downstream order's owned files if the selected runtime or platform requires different concrete paths.
7. Record any genuinely unresolved product/legal decision as a named blocking gate. Do not leave ordinary technical choices unbound.
8. Run the documentation validations and hand off the three artifacts with a decision summary.

## Required validation

```bash
test -f docs/v2-assisted-apply-spec.md
test -f docs/automation/platform-register.md
test -f docs/automation/security-model.md
! rg -n '<RUNNER_|<BROWSER_|<PROFILE_|<PRIMARY_ATS_|<ANSWER_' \
  docs/work-orders/back/BACK-009-applicant-data-vault.md \
  docs/work-orders/back/BACK-010-application-orchestration-audit.md \
  docs/work-orders/back/BACK-011-grounded-application-answering.md \
  docs/work-orders/front/FRONT-005-application-automation-control-center.md \
  docs/work-orders/cross-repo/CROSS-006-browser-automation-runner.md \
  docs/work-orders/cross-repo/CROSS-007-first-platform-automation.md \
  docs/work-orders/cross-repo/CROSS-008-second-platform-automation.md \
  docs/work-orders/cross-repo/CROSS-009-automated-application-acceptance.md \
  docs/v2-assisted-apply-spec.md docs/automation
rg -n "APPROVED_PRIMARY|APPROVED_BACKUP|RESEARCH_ONLY|REJECTED" docs/automation/platform-register.md
rg -n "VERIFIED_PROFILE|APPROVED_REUSABLE|GROUNDED_GENERATED|REVIEW_REQUIRED|PROHIBITED_AUTOMATION" docs/v2-assisted-apply-spec.md
git diff --check
git status --short
```

Manually verify every primary first-party documentation, privacy, and terms link on the handoff date.

## Acceptance criteria

- The successor V2 specification exists without altering V1's accepted historical scope.
- Exactly two primary platform families and at least one backup are evidence-backed and bound to stable adapter IDs.
- The runtime, browser channel, profile custody, local transport, concurrency, retry, timeout, answer-provider, confidence, submission, and evidence contracts are concrete.
- Disposable spikes prove persistent authentication, multi-page navigation, file upload, restart/resume, and confirmation detection, or record a precise blocking result.
- Every downstream Batch 03 placeholder, path, dependency, and validation command is mechanically reconciled before handoff.
- No production automation, dependency, lockfile, database, personal resume, browser profile, credential, or real application submission is introduced.
- The owner accepts the V2 specification and platform set before this order becomes `DONE`.

## Forbidden decisions

- Do not reduce the product to autofill plus mandatory final review.
- Do not authorize autonomous job selection in Batch 03.
- Do not bypass CAPTCHA, access controls, platform restrictions, or authentication.
- Do not submit an application unless the owner explicitly selected that exact genuine job or authorized the exact test environment.
- Do not infer permission from technical accessibility alone.
- Do not leave placeholders for mechanical decisions that the research can resolve.
- Do not add a message broker, cloud browser service, general workflow engine, or multi-user account system.

## Handoff evidence

- V2 product specification
- Platform decision matrix with first-party sources and retrieval dates
- Automation spike transcripts with no personal data
- Security/data-flow model and answer-policy matrix
- Complete downstream binding diff
- Explicit owner/legal gates, if any

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
