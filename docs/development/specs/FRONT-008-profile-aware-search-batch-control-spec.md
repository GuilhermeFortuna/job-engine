# FRONT-008: Profile-aware search and batch Auto Apply control

**Status:** `BLOCKED` (authoritative: [`../STATUS.md`](../STATUS.md))  
**Product direction:** [`../../local-first-product-direction.md`](../../local-first-product-direction.md)  
**Depends on:** BACK-014, BACK-016, BACK-017, CROSS-016  
**Implementation plan:** [`../plans/FRONT-008-profile-aware-search-batch-control-plan.md`](../plans/FRONT-008-profile-aware-search-batch-control-plan.md)

## Purpose

Turn the existing per-job launcher into a profile-aware selection and batch
authorization experience while presenting truthful application capability for
every job and supporting roles beyond software engineering.

## Requirements

### Search and selection

- Job discovery, metadata, headings, empty states, and filter labels describe a
  general job search, not a software-only product. Technology filters may remain
  optional; jobs without technology tags remain first-class results.
- Each job card and detail page shows exactly one primary action derived from the
  backend target contract: `Auto Apply`, `Apply with assistance`, or `Apply on
  external site`, with a concise reason when automation is unavailable.
- Only executable targets can be selected for Auto Apply. Selection supports
  card/detail toggle, select-visible, and clear; it is scoped to the active
  profile and cleared on profile switch.
- Selection survives URL-backed filtering/pagination within the active session
  but is revalidated against current targets before preview/authorization.

### Batch authorization

- A persistent selection tray shows count, applicant, and capability issues.
  Opening authorization fetches a backend preview and lists the exact applicant,
  resume, jobs, companies, target providers, mode, duplicates, and known
  exceptions.
- The user explicitly chooses a resume and one mode for the batch. Full-auto uses
  the frozen owner-confirmation revision and requires one action for the exact
  selection; routine runs do not ask for another submit approval.
- Any invalid item blocks authorization and identifies it. The user may remove
  it; the UI never silently drops or substitutes a job.
- Successful authorization navigates to the durable batch detail page and clears
  only the authorized selection.

### Queue and intervention

- `/applications` groups batches by active profile and shows queued, running,
  needs-attention, submitted, failed, and cancelled counts plus worker-pool
  readiness.
- `/applications/batches/{batchId}` shows immutable authorization summary,
  per-job progress, receipts, failures, and specific exceptions. The embedded
  workspace can attach to the selected active/paused run without stopping other
  workers.
- Genuine exceptions expose only allowed resolution or cancellation actions.
  Authentication, CAPTCHA, unsupported controls, and ambiguous submission are
  never represented as routine retry buttons.
- Ordinary-browser mode stays useful: search/profile/history render, executable
  jobs explain that desktop runtime is required, and external actions remain
  available.

## Accessibility and resilience

- Selection and batch controls are keyboard-operable, announce changing counts
  and validation errors, preserve focus through dialogs, and work at mobile and
  desktop widths.
- API/SSE/IPC reconnects reconcile from durable backend state and never infer a
  submission from a toast or transient desktop event.

## Constraints and non-goals

- The user selects every job. No ranking, recommendation, automatic selection,
  or mass application beyond the configured batch limit is introduced.
- This pair consumes capability and batch contracts; it does not guess providers
  from URLs or create client-side authorization semantics.

## Acceptance criteria

1. Software and non-software searches produce neutral copy and selectable
   executable Greenhouse/Lever results.
2. Aggregator-only jobs remain useful but cannot be selected or launched as Auto
   Apply.
3. One authorization creates the exact reviewed batch for the active profile and
   resume; profile switches, stale previews, and invalid items fail visibly.
4. Multiple runs visibly progress at once, one exception affects only its item,
   and receipts remain associated with the correct applicant/job.
5. Browser and Electron E2E tests cover back/forward, pagination, profile switch,
   mixed capability, batch authorization, concurrent progress, restart, and
   ordinary-browser fallback.
