# FRONT-005: Application Automation Control Center

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-009, BACK-010, CROSS-006

**Unblocks:** CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md` (bound by CROSS-005)

## Objective

Give the owner a clear, high-automation workflow: select one or more jobs, choose the resume and automation mode, queue them once, monitor live progress, resolve only named exceptions, and inspect trustworthy submission receipts and history.

## Owned files

- `/apps/web/src/app/applications/page.tsx` (new)
- `/apps/web/src/app/applications/[runId]/page.tsx` (new)
- `/apps/web/src/app/applications/loading.tsx` (new)
- `/apps/web/src/app/applications/error.tsx` (new)
- `/apps/web/src/features/applications/api.ts` (new)
- `/apps/web/src/features/applications/types.ts` (new)
- `/apps/web/src/features/applications/components/AutomationLauncher.tsx` (new)
- `/apps/web/src/features/applications/components/ApplicationQueue.tsx` (new)
- `/apps/web/src/features/applications/components/ApplicationRunDetails.tsx` (new)
- `/apps/web/src/features/applications/components/ExceptionResolver.tsx` (new)
- `/apps/web/src/features/applications/components/ReceiptEvidence.tsx` (new)
- `/apps/web/src/features/applications/components/*.test.tsx` (new; application components only)
- `/apps/web/src/features/jobs/components/JobCard.tsx` (selection/automation action only)
- `/apps/web/src/features/jobs/components/JobCard.test.tsx` (selection/automation tests only)
- `/apps/web/src/features/jobs/components/JobDetails.tsx` (automation action only)
- `/apps/web/src/features/jobs/components/JobDetails.test.tsx` (automation tests only)
- `/apps/web/src/app/globals.css` (application-control styles only)
- `/apps/web/e2e/application-automation.spec.ts` (new)
- `/apps/web/e2e/mock-server.mjs` (application API fixtures only)

## Fixed user flow

### Launch

- Job cards and details expose `Apply automatically` only when a validated application URL exists.
- The owner may select one job or a bounded set of visible results, then chooses a registered resume and an automation mode defined by CROSS-005 (`FULL_AUTO` or `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`).
- The launch confirmation shows the exact jobs, application origins, resume label/checksum summary, current profile version, and whether automatic final submission is enabled.
- One confirmation creates the queue through `POST /api/v1/application-runs`. It is not followed by a routine per-job final-review step.
- Duplicate conflicts are shown per job and require the explicit backend override flow; the UI cannot silently retry or create a second run.

### Monitor

- `/applications` shows queued, running, needs-input, paused-auth, submitted, failed, cancelled, and submission-unknown states with timestamps and current steps.
- The UI consumes the Server-Sent Events (SSE) stream (`GET /api/v1/application-runs/stream`) bound by CROSS-005 for live updates; it must not infer progress from timers.
- Existing job search remains usable while runs execute.
- The run-details route shows a redacted ordered event timeline, current exception, selected job/resume, attempt count, and receipt state.

### Exceptions

- `NEEDS_INPUT` displays the exact normalized question, why automation paused, available options/constraints, relevant evidence, and the proposed answer if any.
- Owner responses state whether the value is one-time or should update the reusable answer bank, then call the backend resolution endpoint.
- A `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` run paused at `SUBMIT_ARMED` presents the prepared summary and calls `POST /api/v1/application-runs/{run_id}/release-submit`; it does not reuse the answer-resolution endpoint.
- `PAUSED_AUTH` instructs the owner to complete login/challenge in the dedicated runner browser and provides a resume action; it never asks for credentials in Job Engine.
- `SUBMISSION_UNKNOWN` is visibly distinct from success and offers evidence inspection, not blind retry.

### Receipts

- `SUBMITTED` requires backend receipt evidence. Show platform, confirmation timestamp, receipt identifier or final URL when safe, and redacted screenshot/DOM artifact availability.
- The UI must never declare submission based on a button click, navigation attempt, optimistic state, or missing runner heartbeat.

## Procedure

1. Add typed clients for profile/resume summaries, run creation/list/detail, exception resolution, resume/cancel, duplicate override, and evidence metadata.
2. Implement single-job and bounded multi-selection launch with a resume selector and explicit auto-submit summary.
3. Build the applications queue and run-details routes with backend-owned state labels and accessible live updates.
4. Build exception-specific resolution for missing answers and auth/challenge pauses without accepting credentials.
5. Build receipt/evidence presentation and strong distinction among submitted, unknown, failed, paused, and cancelled outcomes.
6. Add unit tests for every state, duplicate conflicts, partial queue creation, stale profile/resume versions, sensitive-value redaction, and keyboard/focus behavior.
7. Add Playwright tests against the synthetic runner/API fixtures for queue launch, unattended success, answer exception/resume, auth pause, duplicate conflict, failure, cancellation, and submission unknown.

## Required validation

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run test:e2e -- application-automation.spec.ts
corepack pnpm --filter @job-engine/web run build
git diff --check
```

## Acceptance criteria

- One confirmation can queue a supported single job or bounded selection for automatic final submission.
- Queue and details states come from the backend and remain truthful through refresh, restart, partial failure, and runner disconnect.
- Successful supported fixture runs require no routine final-review interaction.
- Missing-answer and authentication exceptions are actionable and resume the same run without duplicate creation.
- Duplicate submissions and submission-unknown outcomes cannot be bypassed by an ordinary retry button.
- Receipt evidence is available only for backend-confirmed submissions and is redacted/accessibly presented.
- Keyboard navigation, focus management, live announcements, contrast, responsive layouts, and reduced-motion behavior pass automated and manual checks.

## Forbidden decisions

- Do not request, display, or store passwords, cookies, runner tokens, absolute resume paths, or raw sensitive audit values.
- Do not create runs automatically from search results without owner selection and launch confirmation.
- Do not add a mandatory final-review screen to every otherwise authorized application.
- Do not infer submitted state client-side or allow blind retry after `SUBMISSION_UNKNOWN`.
- Do not implement browser selectors, platform rules, answer generation, run transitions, or duplicate policy in React.
- Do not add application scoring, CRM stages beyond the fixed execution states, notifications, or analytics.

## Handoff evidence

- Single and multi-job launch walkthrough
- Unattended success and receipt evidence
- Missing-answer/auth/unknown-submission exception evidence
- Duplicate and stale-version behavior
- Accessibility and responsive evidence
- Unit, E2E, and build transcripts

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
