# FRONT-005: Embedded Application Workspace

**Status:** `READY` in authoritative `docs/work-orders/STATUS.md`

**Owner:** Unassigned

**Depends on:** CROSS-010

**Unblocks:** CROSS-009

**Product spec:** `docs/v2-assisted-apply-spec.md`

## Objective

Turn the existing Next.js job experience into the trusted presentation layer for one visible assisted application: launch from an explicitly selected job, reserve and report the embedded browser rectangle, show job/resume/form provenance beside the real page, resolve exceptions in context, require explicit final release, and present truthful receipt or uncertainty states.

## Owned files

- `/apps/web/src/app/applications/[runId]/workspace/page.tsx` (new)
- `/apps/web/src/app/applications/[runId]/workspace/loading.tsx` (new)
- `/apps/web/src/app/applications/[runId]/workspace/error.tsx` (new)
- `/apps/web/src/features/applications/api.ts` (new)
- `/apps/web/src/features/applications/types.ts` (new)
- `/apps/web/src/features/applications/desktop-bridge.ts` (new)
- `/apps/web/src/features/applications/api.test.ts` (new)
- `/apps/web/src/features/applications/desktop-bridge.test.ts` (new)
- `/apps/web/src/features/applications/components/ApplicationLauncher.tsx` (new)
- `/apps/web/src/features/applications/components/ApplicationWorkspace.tsx` (new)
- `/apps/web/src/features/applications/components/BrowserViewport.tsx` (new)
- `/apps/web/src/features/applications/components/BrowserToolbar.tsx` (new)
- `/apps/web/src/features/applications/components/JobContextPanel.tsx` (new)
- `/apps/web/src/features/applications/components/FieldReviewPanel.tsx` (new)
- `/apps/web/src/features/applications/components/ApplicationStatusBar.tsx` (new)
- `/apps/web/src/features/applications/components/ExceptionResolver.tsx` (new)
- `/apps/web/src/features/applications/components/SubmissionReceipt.tsx` (new)
- `/apps/web/src/features/applications/components/*.test.tsx` (new; workspace components only)
- `/apps/web/src/features/jobs/components/JobCard.tsx` (desktop assisted-apply action only)
- `/apps/web/src/features/jobs/components/JobCard.test.tsx` (action tests only)
- `/apps/web/src/features/jobs/components/JobDetails.tsx` (desktop assisted-apply action only)
- `/apps/web/src/features/jobs/components/JobDetails.test.tsx` (action tests only)
- `/apps/web/src/app/globals.css` (workspace styles only)
- `/apps/web/e2e/embedded-application-workspace.spec.ts` (new)
- `/apps/web/e2e/mock-server.mjs` (workspace API/bridge fixtures only)

Do not edit Electron main/preload code, backend domain/API behavior, form observers/fillers, or ATS adapters.

## Fixed launch contract

- `Apply in Job Engine` appears only for a job with a validated **HTTPS** application URL and when `getCapabilities().embeddedBrowser === true`. HTTP remains eligible only for the ordinary external link; Electron permits HTTP solely for loopback test fixtures.
- Ordinary web-browser use retains the existing safe external application link and does not attempt iframe embedding.
- Launch is one job at a time. The owner selects one registered resume and confirms the exact job, company, application origin, resume label/checksum summary, and assisted/manual-release behavior.
- Create the run with `POST /api/v1/application-runs` using one `job_group_id` and `automation_mode: "semi_auto_pause_before_submit"`.
- Do not display or send `FULL_AUTO`; do not offer multi-job application queues.
- After creation, the launcher only navigates to `/applications/{runId}/workspace`. The workspace exclusively owns native-view lifecycle: subscribe, report valid bounds, then invoke `openApplication({ runId })`. The UI never passes the application URL to Electron.
- Duplicate conflicts are displayed with the existing run link. Explicit override uses the backend contract and cannot be hidden behind an ordinary retry.

## Fixed workspace layout

Desktop layout has three coordinated regions:

1. **Context rail:** job title/company/source, application origin, selected resume, current run status, and checkpoint.
2. **Browser viewport:** a real empty layout rectangle measured with `ResizeObserver`; Electron owns the `WebContentsView` rendered over it. Include trusted back, forward, reload, blocked-navigation, loading, and desktop-unavailable states.
3. **Assistance rail/status bar:** filled/review/unresolved counts from typed safe field reports, reason codes, exceptions, and final submission/receipt state. The implemented contract does not expose proposed values, decision confidence, policy category, or provenance to this UI.

React must not pretend the remote page is a DOM child. Send bounded coordinates after mount, resize, scroll, zoom/device-pixel-ratio change, panel collapse, and route transition. Close the application view before leaving the workspace.

At the minimum supported desktop viewport (1280x720), the embedded page remains large enough to complete a form and both rails remain reachable. Narrower windows show a deliberate unsupported-size message rather than overlapping the native view. Mobile web behavior remains the existing external-link experience.

The workspace owns both resize transitions. Supported to undersized stops bounds reporting and closes the native view exactly once. Undersized to supported re-subscribes if necessary, measures a valid rectangle, and reopens in the required order. Unmount/navigation cancels pending measurements, unsubscribes, and closes exactly once.

## Review, exception, and submission behavior

- Consume `GET /api/v1/application-runs/{run_id}` plus its SSE stream. Backend status is authoritative; do not infer completion from browser navigation. Deduplicate by `{run_id}:{sequence_num}`, retain the last event ID across reconnects, reject events for another run, and refetch authoritative detail after state-changing events.
- Show only each exception's typed `field_reports[]` projection. Never render arbitrary `context_payload` or `resolution_payload`, runner tokens, hidden values, raw DOM, cookies, absolute resume paths, or unredacted audit payloads.
- A field report contains only `field_fingerprint`, `label`, `control_type`, `required`, `status`, `reason_code`, optional backend-classified `question_intent`, options/length/pattern constraints, and `allow_save_to_answer_bank`. It never contains a field value or proposed answer.
- Submit resolutions through `POST /api/v1/application-runs/{run_id}/resolve-answers` with `exception_id` and exactly one `{ field_fingerprint, answer_text, save_to_answer_bank, jurisdiction?, platform_scope? }` item for every report in that exception. Do not send `question_intent` or `policy_category`; those are backend-authoritative.
- Resolution is permitted only for pending `missing_profile_field`, `unresolved_question`, and `review_required` exceptions. The backend validates field membership, control compatibility, duplicate/replay use, and save eligibility before requeueing. The resumed run consumes the exact owner answer only when run, exception, fingerprint, label, and control type still match. `answer_text` is always `[REDACTED]` in user-facing resolution payloads.
- Saving an eligible answer creates a reusable answer for future runs without adding it to the active run's frozen baseline. Active-run authorization validates every bound snapshot entry and ignores answers added later; the per-run owner resolution supplies the current run.
- `PAUSED_AUTH`/CAPTCHA instructs the owner to complete the challenge directly in the embedded page and then use the existing resume action. Never request credentials in Job Engine controls.
- Enable trusted `Submit application` only when the run is `NEEDS_INPUT`, the latest exception is `SEMI_AUTO_ARMED`, the checkpoint is `submit_armed`, every required field is resolved, and the desktop bridge reports the matching run open.
- Show a concise final summary, require one explicit activation, call `release-submit`, immediately disable the action, and follow backend events. Do not optimistically show success.
- `SUBMISSION_UNKNOWN` is visually distinct and offers allowlisted evidence **metadata** inspection (`receipt`/`log` type, capture time, hash, size), never artifact content, relative paths, arbitrary metadata payloads, or blind retry. `SUBMITTED` requires a backend receipt.

## Procedure

1. Add exact TypeScript projections for implemented applicant/resume, application-run, event, typed exception field-report, redacted resolution-summary, evidence-metadata, and receipt responses. There is no decision-summary response.
2. Add a runtime-safe optional desktop bridge wrapper with SSR/ordinary-browser fallbacks; never import Electron in Next.js code.
3. Implement single-job launch and duplicate-conflict handling from job card/details.
4. Build the split workspace, browser rectangle measurement/cleanup, toolbar, minimum-size behavior, and browser-state announcements.
5. Build field review and exception resolution using backend/CROSS-010 state without duplicating answer policy.
6. Implement guarded final release and truthful submitted/unknown/failure/receipt states.
7. Add unit tests for launch payload, no-desktop fallback, bounds updates/cleanup, every decision/outcome, stale/mismatched run protection, duplicate conflict, keyboard/focus, and sensitive-value redaction.
8. Add Playwright E2E with a mocked desktop bridge and deterministic API/SSE fixtures for launch, multi-step progress, review resolution, auth pause, prepared submit, confirmed receipt, unknown submission, cancellation, resize, and route cleanup.

## Required validation

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run build
corepack pnpm --filter @job-engine/web run test:e2e -- embedded-application-workspace.spec.ts
git diff --check
```

## Acceptance criteria

- An eligible job launches exactly one semi-auto run and opens its workspace through the typed desktop bridge; ordinary browser use remains safe and functional.
- The browser rectangle tracks all relevant layout changes and is closed on navigation/unmount without covering trusted controls.
- Job context, resume, field counts, safe field identity/state, reason codes, exceptions, and backend progress remain understandable beside the real application page.
- Missing/sensitive answers and auth/CAPTCHA cases are actionable in the same workspace and resume the same run.
- Final submission always requires the owner's trusted-UI action; the button cannot double-fire and does not claim success before backend receipt reconciliation.
- Submitted, submission-unknown, failed, cancelled, and disconnected states are visually and semantically distinct.
- Keyboard navigation, focus order, live announcements, contrast, reduced motion, and the 1280x720 minimum layout pass automated and manual review.

## Forbidden decisions

- Do not embed remote pages with iframe or `<webview>` and do not import Electron APIs into React.
- Do not expose `FULL_AUTO`, multi-job application queues, background application controls, or automatic launch.
- Do not accept arbitrary URLs, DOM, JavaScript, IPC channels, tokens, paths, credentials, or cookies through UI code.
- Do not reimplement answer policy, run transitions, duplicate rules, selectors, or receipt truth in React.
- Do not add scoring, research, resume tailoring, CRM stages, notifications, analytics, or extension support.

## Handoff evidence

- Desktop and ordinary-browser launch walkthroughs
- Bounds/resize/route-cleanup evidence
- Field review and auth/CAPTCHA exception evidence
- Explicit release, confirmed receipt, and submission-unknown evidence
- Duplicate and stale/mismatched-run behavior
- Accessibility, minimum-viewport, unit, E2E, and build transcripts
- Real Electron walkthrough proving initial bounds-before-open, both 1280x720 resize transitions, scroll/zoom/DPR tracking, route cleanup, native-toolbar separation, and final-release controls outside the `WebContentsView` rectangle. A mocked browser bridge does not satisfy this gate.

## Resolved technical handoff

- Owner answers are stored as a per-run resolved-exception overlay and returned to the runner only for an exact run/field/identity match with reason `owner_confirmed` and evidence source `owner_resolution`.
- `GET /api/v1/application-runs/{run_id}` exposes typed safe `field_reports`; resolved `answer_text` is redacted.
- `POST .../resolve-answers` accepts field fingerprints rather than client-supplied intents or policy categories, rejects cross-field and replay attempts, validates control constraints, and requeues only after every exception field is answered.
- Reusable answers added after run creation no longer invalidate the run's frozen answer-bank snapshot and are not silently added to that run's baseline.
- Remediation validation on 2026-08-19: API Ruff/format/mypy passed; 41 focused API service/integration tests passed against PostgreSQL; all 282 desktop unit/runtime/form tests passed; `git diff --check` passed.

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
