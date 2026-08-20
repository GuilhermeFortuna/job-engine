# CROSS-013: Auto-Apply Production-Path Acceptance

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** BACK-012, BACK-013, CROSS-012, CROSS-014, FRONT-006

**Unblocks:** Batch 04 completion

**Product contract:** `docs/v2.1-auto-apply-outcome-contract.md` after CROSS-011 acceptance

## Objective

Independently prove that the visible desktop product—not a separately composed fixture driver—delivers the accepted V2.1 auto-apply journey. Acceptance must begin in the real Electron UI, traverse the compiled production entrypoint and real API/database, and demonstrate automatic supported-platform submission after one initial owner authorization with exception-only intervention.

## Owned files

- `/docs/evidence/auto-apply-production-acceptance.md` (new)
- `/docs/evidence/auto-apply-production/**` (new; redacted synthetic or explicitly authorized evidence only)
- `/docs/work-orders/STATUS.md` (evidence/decision record only; owner controls status)

No product implementation, fixture expectation, selector, policy, personal data, or approval status is owned by this order.

## Entry gate

- CROSS-011, BACK-012, BACK-013, CROSS-012, CROSS-014, and FRONT-006 are `DONE` in `docs/work-orders/STATUS.md`.
- The candidate commit is named, clean, and built from a frozen lockfile.
- A disposable PostgreSQL database, synthetic applicant/profile/answer bank/resume, and local HTTPS generic/Greenhouse/Lever sites are available.
- The compiled Electron production main entrypoint is used; test-only runtime composition is prohibited.
- Desktop user data and evidence roots are disposable and outside the repository.
- Any live ATS inspection or submission remains separately owner-authorized and subject to existing legal gates. Synthetic production-path acceptance must not be skipped when live access is unavailable.

## Acceptance scenarios

### A. Discoverability and readiness

1. Launch the desktop application from a clean state and verify `Jobs` and `Applications` are visible.
2. Complete or inspect profile, resume, and answer-bank readiness through the UI.
3. Verify eligible, assisted-only, ordinary-browser, invalid-URL, missing-data, and runtime-unavailable job action states; none silently disappear.

### B. Production full-auto journey

1. Select exact synthetic job(s), resume, and `Auto apply`; inspect the authorization summary and confirm once.
2. Prove the real UI creates only those `FULL_AUTO` runs and the production Electron coordinator claims them.
3. For generic, Greenhouse, and Lever local HTTPS sites, observe production code fill verified values, upload the checksum-matched resume, advance steps, submit without a second routine click, and reconcile a backend receipt.
4. Prove the UI shows live queued/running/progress/submitted state and the audit trail identifies the production runner.

### C. Exceptions and one-shot safety

1. Trigger missing/sensitive/low-confidence answers, auth, CAPTCHA, validation error, unsupported required control, platform drift, network failure, lease loss, renderer crash, and desktop restart.
2. Verify the same run pauses or resumes correctly and no unresolved required value is invented or skipped.
3. Trigger ambiguous post-submit behavior; verify `SUBMISSION_UNKNOWN` and prove no second activation after retry, restart, reclaim, or UI action.
4. Verify duplicate protection and an explicitly authorized duplicate override without accidental submission.

### D. Assisted and browser fallback

1. Create a semi-auto run and prove it still pauses at final release.
2. Open the ordinary browser UI and verify it explains the desktop requirement while retaining safe external application links.
3. Verify remote content cannot access Electron, IPC, filesystem, tokens, cookies from another profile, or the trusted renderer.

### E. Hybrid AI answer boundary

1. Run the committed synthetic corpus through recorded offline responses and the configured loopback local model; prove deterministic/profile/answer-bank answers bypass AI and prohibited/sensitive intents always abstain.
2. Exercise permitted narrative questions with valid evidence, missing evidence, unsupported claims, prompt injection, malformed schema, timeout, unavailable model, budget exhaustion, and low-quality output.
3. Prove provider self-confidence cannot authorize `AUTO_FILL_AND_SUBMIT`; only the exact provider/model/prompt revision accepted by BACK-013's deterministic evaluation gate can make a generated answer submission-eligible.
4. Run an opt-in Gemini smoke with synthetic data only unless the exact paid-project privacy attestation is owner-accepted. Verify backend-only key custody, structured output, provider/model audit identity, and fail-closed behavior.
5. Confirm AI never selects a job, navigates/clicks the ATS, uploads a file, releases a run, or activates submit.

### F. Broad application-platform coverage

1. Recalculate CROSS-014's frozen platform inventory and verify that every application URL from all approved job sources is classified by downstream application provider and support tier.
2. Run every counted generic/ATS family through the compiled production Electron entrypoint; verify that all committed standard-form scenarios and at least 95% of eligible inventory URLs are represented by proven auto-supported families.
3. Inspect Ashby, SmartRecruiters, Workday, and every additional inventoried provider decision. Verify unsupported families remain visible with an exact assisted/manual reason and are excluded honestly from the numerator.
4. Prove the embedded Chromium page is the surface operated by deterministic runtime code and AI supplies only bounded grounded answer decisions.

### G. Owner-visible acceptance

1. Record screenshots or video of the exact desktop journey at 1440x900 and 1280x720.
2. Give the owner the candidate commit, launch command, selected synthetic scenario, expected UI labels, and evidence location.
3. Stop at `REVIEW` until the owner explicitly confirms that automation is discoverable and the supported flow submits without routine intervention.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
docker compose up -d postgres
cd apps/api && uv run alembic upgrade head
corepack pnpm run check
corepack pnpm run test
corepack pnpm run build
corepack pnpm --filter @job-engine/desktop run test:production
corepack pnpm --filter @job-engine/desktop run test:fixtures
corepack pnpm --filter @job-engine/web run test:e2e -- auto-apply-control-center.spec.ts
cd apps/api && uv run pytest tests/domain/test_application_answers.py tests/services/test_answer_providers.py tests/services/test_application_answers.py
git status --short
git diff --check
```

## Acceptance criteria

- The owner can find auto apply without knowing a hidden route, label, or capability condition.
- Production Electron code—not a fixture-only driver—executes generic, Greenhouse, and Lever synthetic runs.
- One initial owner authorization is sufficient for supported full-auto submission; routine success has no second click.
- Only explicitly selected jobs and frozen applicant/resume data are used.
- Genuine exceptions pause safely and remain actionable in the visible Applications UI.
- Local and Gemini providers obey one deterministic-first schema/evidence policy; unaccepted models remain review-only, and self-reported confidence never unlocks submission.
- All standard-form scenarios and the measured broad-provider target pass through production; the final report states the actual coverage percentage and every unsupported provider without claiming unevidenced universality.
- Submission activation is at most once; ambiguous results remain non-success and cannot be blindly retried.
- Assisted mode, ordinary-browser fallback, isolation, accessibility, and restart recovery remain correct.
- Automated evidence, real-Electron evidence, and owner-visible acceptance are independently recorded against one clean commit.

## Forbidden decisions

- Do not repair implementation or weaken tests/fixtures in acceptance scope.
- Do not accept unit, jsdom, mocked bridge, or fixture-driver evidence as proof of production wiring.
- Do not perform unauthorized live mutation/submission or use personal data in committed evidence.
- Do not count a hidden button, direct URL, API call, or developer console action as discoverability.
- Do not mark receipt-less, ambiguous, or visually unreviewed behavior as complete.
- Do not change approval statuses without explicit owner instruction.

## Handoff evidence

- `GO`, `CONDITIONAL_GO`, or `NO_GO` report against a named commit
- Production import/composition proof and backend event trace
- Discoverability/readiness/action-state matrix
- Generic, Greenhouse, Lever, exception, restart, and ambiguity scenario matrix
- Redacted screenshots/video and owner walkthrough instructions
- Full validation transcript and any separately authorized live-scope record

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development` (shared working branch)
- Dispatched at: Not dispatched

## Completion record

- Commit under test: Pending
- Decision: Pending
- Evidence: Pending
- Independent reviewer: Pending owner acceptance
