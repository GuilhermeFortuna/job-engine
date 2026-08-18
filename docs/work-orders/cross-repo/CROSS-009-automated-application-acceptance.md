# CROSS-009: Automated Application End-to-End Acceptance

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** BACK-010, BACK-011, CROSS-006, CROSS-007, CROSS-008, FRONT-005

**Unblocks:** Batch 03 completion

**Product spec:** `docs/v2-assisted-apply-spec.md` (bound by CROSS-005)

## Objective

Independently determine whether Batch 03 delivers trustworthy high automation: explicit job selection followed by unattended completion and confirmed submission on both approved platform families, with recoverable exception handling, duplicate protection, grounded answers, secure resume custody, and truthful evidence.

## Owned files

- `/docs/evidence/automated-application-acceptance.md` (new)
- `/docs/evidence/automated-application/**` (new; redacted, synthetic or explicitly authorized evidence only)
- `/docs/work-orders/STATUS.md` (Batch 03 acceptance evidence/decision entries only; owner controls status)

No product implementation, selector, fixture expectation, policy threshold, or personal resume file is owned by this order.

## Entry gate

- Every dependency is `DONE` in `docs/work-orders/STATUS.md` with its required evidence.
- CROSS-005 bindings contain no placeholders and the current platform register still supports both primary platforms.
- A disposable database and synthetic applicant/resume fixtures are configured.
- The dedicated browser profile and evidence roots are outside the repository.
- Any live submission has separate owner authorization naming either the exact genuine job the owner intends to apply to or the exact authorized test environment. Without it, run all synthetic and authorized dry-run gates but do not claim live-production submission acceptance.
- `LEGAL-GATE-ATS-001` has explicit owner acceptance for each live-tested platform. If it remains open, live submission is prohibited and the maximum outcome is `CONDITIONAL_GO`.
- `PROVIDER-PRIVACY-001` has explicit owner acceptance before any external generated-answer call. If it remains open, use deterministic-only behavior and treat provider-dependent acceptance scenarios as an outstanding conditional gate.

## Acceptance scenarios

### Full synthetic matrix

1. Submit a one-page generic conventional application with all values pre-authorized.
2. Submit a multi-page `greenhouse` fixture with resume upload, conditional questions, and generated grounded narrative.
3. Submit a materially different `lever` fixture and capture its receipt.
4. Queue multiple explicitly selected jobs and prove concurrency/ordering bounds.
5. Restart the API and runner during separate pre-submit stages; resume without repeated actions.
6. Trigger missing answer, sensitive/legal question, expired login, CAPTCHA marker, unexpected origin, platform validation error, file rejection, provider timeout, and unsupported control; verify named pause/failure states and same-run resume where allowed.
7. Simulate ambiguous post-submit navigation; verify `SUBMISSION_UNKNOWN`, evidence capture, and no second click.
8. Attempt duplicate active and already-submitted runs; verify rejection and separately audit an explicit owner override.
9. Inspect API, application, runner, browser, and evidence logs for secrets, cookies, raw sensitive values, absolute resume paths, or personal fixture leakage.

### Authorized platform checks

- Perform a headed non-submitting dry run on both bound platform families using only owner-authorized targets and stop before final submission.
- If the owner selects a genuine desired job or supplies an authorized test environment, perform at most one acceptance submission per platform, verify every transmitted value against the approved profile/answer evidence, and capture the real confirmation.
- A fake application to an unrelated employer, invented candidate identity, or unselected posting is prohibited.

## Procedure

1. Re-read the V2 specification, platform register, security model, current status board, and every dependency handoff.
2. Verify fresh installation, migrations, local configuration, runner startup, dedicated-profile custody, and no personal artifacts in Git.
3. Execute the synthetic matrix and record exact versions, commands, outcomes, artifact hashes, and any deviations.
4. Run authorized headed platform checks. Clearly separate synthetic, dry-run, and actual-submission evidence.
5. Manually inspect filled/submitted values, resume identity/checksum, generated-answer claims/provenance, browser behavior, receipts, exceptions, restart behavior, and evidence redaction.
6. Run full repository validation and browser accessibility review.
7. Write `GO`, `CONDITIONAL_GO`, or `NO_GO`. `GO` requires all synthetic gates plus both authorized live submissions; when live submission authorization is unavailable, the maximum outcome is `CONDITIONAL_GO` with the exact remaining gate.
8. Report product defects to the owning order; do not repair them inside acceptance scope.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
corepack pnpm --filter @job-engine/automation run test:fixtures
corepack pnpm --filter @job-engine/web run test:e2e -- application-automation.spec.ts
git ls-files docs/resume | rg -v 'README.md|\.template\.|\.example\.' && exit 1 || true
git diff --check
```

## Acceptance criteria

- Both approved adapters and the permitted generic path pass their complete synthetic flows.
- At least two distinct supported platform families complete owner-authorized live submission with verified values and receipts for `GO`; otherwise the report truthfully stops at `CONDITIONAL_GO` or `NO_GO`.
- Routine supported success is unattended after the initial queue confirmation.
- Every exception produces the correct pause/failure state and actionable evidence; resumption does not duplicate prior steps.
- Duplicate and ambiguous-submission protections prevent accidental repeat submissions.
- Generated answers are grounded, policy-compliant, and free of unsupported claims in manual review.
- No secrets, credentials, cookies, personal fixtures, absolute paths, or unredacted sensitive answers appear in committed evidence or logs.
- Automated checks, manual browser behavior, responsive/accessibility review, and restart recovery are independently evidenced.

## Forbidden decisions

- Do not modify product code, fixtures, selectors, thresholds, or assertions to obtain a passing result.
- Do not mark an ambiguous outcome as submitted.
- Do not make unauthorized live applications or use a fabricated identity.
- Do not promote fixture-only success to live-production `GO`.
- Do not expose personal resume/profile content in acceptance artifacts.
- Do not mark dependency or acceptance statuses `DONE` without owner instruction.

## Handoff evidence

- Formal acceptance report with `GO`, `CONDITIONAL_GO`, or `NO_GO`
- Synthetic scenario matrix and artifact hashes
- Authorized dry-run/live-test scope and outcomes
- Submitted-value/receipt verification with redaction
- Exception, restart, duplicate, and ambiguous-submit evidence
- Full repository, browser, and accessibility validation transcripts

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
