# FRONT-006: Visible Auto-Apply Control Center and Readiness UI

**Status:** `BLOCKED`

**Owner:** Unassigned

**Depends on:** CROSS-011, BACK-012

**Unblocks:** CROSS-013

**Product contract:** `docs/v2.1-auto-apply-outcome-contract.md` after CROSS-011 acceptance

## Objective

Make automation visible, understandable, and operable from the desktop UI. The owner must be able to prepare applicant data, see automation capability on every applicable job, explicitly launch full-auto or assisted runs, and monitor queued, running, exception, receipt, and uncertainty states from a persistent Applications destination.

## Owned files

- `/apps/web/src/app/layout.tsx` (primary navigation only)
- `/apps/web/src/app/applications/page.tsx` (new)
- `/apps/web/src/app/applications/loading.tsx` (new)
- `/apps/web/src/app/applications/error.tsx` (new)
- `/apps/web/src/app/applications/settings/page.tsx` (new)
- `/apps/web/src/app/applications/[runId]/workspace/**` (mode/status integration only)
- `/apps/web/src/features/applications/api.ts`
- `/apps/web/src/features/applications/types.ts`
- `/apps/web/src/features/applications/desktop-bridge.ts`
- `/apps/web/src/features/applications/components/**`
- `/apps/web/src/features/jobs/components/JobCard.tsx` (application actions only)
- `/apps/web/src/features/jobs/components/JobDetails.tsx` (application actions only)
- `/apps/web/src/app/globals.css` (control-center/application styles only)
- `/apps/web/e2e/auto-apply-control-center.spec.ts` (new)
- `/apps/web/e2e/mock-server.mjs` (Batch 04 fixtures only)

Do not edit Electron main/preload implementation, backend behavior, answer policy, source ingestion, job normalization, or unrelated catalog styling.

## Fixed information architecture

- The global header exposes `Jobs` and `Applications` in both desktop Electron and ordinary browser rendering.
- `/applications` shows a readiness summary followed by runs grouped or filterable as needs attention, active/queued, and completed.
- `/applications/settings` consumes the existing applicant-profile, resume, and answer-bank APIs. It supports profile review/update, resume registration/default selection, answer-bank management, and clear incomplete-state guidance without exposing absolute paths after registration.
- Every job with an application URL renders one application-state control; it never disappears silently:
  - `Auto apply` when the desktop bridge and accepted full-auto capability are available.
  - `Apply with assistance` when assisted mode is available but full-auto is not appropriate.
  - `Automation unavailable` with a specific reason for ordinary browser, non-HTTPS URL, unsupported platform/capability, missing profile, or missing resume.
- Selecting `Auto apply` shows the exact job(s), company, origin, resume/checksum summary, mode, exception behavior, and the BACK-012 confirmation text. One confirmation creates `automation_mode: "full_auto"` runs.
- Assisted mode explicitly creates `semi_auto_pause_before_submit`; mode is never inferred.
- The control center shows mode, job, resume, created/updated time, progress, current exception, receipt, failure, and `SUBMISSION_UNKNOWN`. It provides no blind-retry action after a submit attempt.
- Runtime/bridge failure is a visible degraded state. Loading the Next.js UI inside Electron is not displayed as automation-ready until the production runtime capability is confirmed.

## Procedure

1. Bind exact CROSS-011/BACK-012 schemas and typed projections; remove the hard-coded semi-auto create payload.
2. Add stable global navigation and the applications list/readiness route.
3. Build applicant, resume, and answer-bank setup using existing APIs and optimistic-version/error contracts.
4. Replace conditional-null launcher behavior with explicit action or reason states on cards and details.
5. Implement full-auto and assisted launch confirmation, duplicate handling, and navigation to the run/workspace/control-center state.
6. Extend workspace/control-center rendering for production runtime progress, exception recovery, receipts, disconnects, and submission uncertainty.
7. Add unit and Playwright coverage for every capability state, setup state, mode payload, status group, exception, accessibility state, and ordinary-browser fallback.
8. Perform a real Electron visual walkthrough at 1440x900 and the supported 1280x720 minimum.

## Required validation

```bash
corepack pnpm --filter @job-engine/web run check
corepack pnpm --filter @job-engine/web run test
corepack pnpm --filter @job-engine/web run build
corepack pnpm --filter @job-engine/web run test:e2e -- auto-apply-control-center.spec.ts
git diff --check
```

## Acceptance criteria

- A first-time owner can discover Applications, understand readiness, and prepare profile/resume/answers without command-line database work.
- Every applicable job visibly exposes an action or a precise unavailability reason.
- Full-auto creation sends the exact BACK-012 authorization and `full_auto`; assisted creation sends `semi_auto_pause_before_submit`.
- The Applications page makes queued/running/needs-attention/submitted/failed/unknown state and mode obvious.
- Genuine exceptions are actionable, while successful full-auto has no routine final-release control.
- Ordinary browser and broken/missing desktop runtime states are safe and explanatory rather than silent.
- Keyboard, focus, announcements, contrast, reduced motion, responsive behavior, and minimum desktop workspace pass automated and manual review.
- Owner-visible screenshots or walkthrough evidence are attached before the order can be accepted.

## Forbidden decisions

- Do not hide the complete feature when a capability check fails.
- Do not label semi-auto as auto apply or imply submission before a backend receipt.
- Do not default or silently switch automation modes.
- Do not duplicate answer policy, authorization, queue, receipt, or retry truth in React.
- Do not expose secrets, tokens, absolute résumé paths, raw sensitive answers, cookies, or arbitrary evidence contents.
- Do not add autonomous job selection, scoring, résumé tailoring, CRM, notifications, or unrelated catalog redesign.

## Handoff evidence

- First-run readiness and settings walkthrough
- Job-card/detail capability-state matrix
- Full-auto and assisted creation payload evidence
- Applications queue/status/exception/receipt/unknown screenshots
- Ordinary-browser and runtime-unavailable behavior
- Unit, E2E, build, accessibility, responsive, and real-Electron visual transcripts

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development` (shared working branch)
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending owner visual review
