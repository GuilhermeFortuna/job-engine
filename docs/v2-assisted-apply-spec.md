# Job Engine V2 Embedded Assisted Apply Specification

**Status:** Owner-approved Batch 03 scope, revised 2026-08-18

**Purpose:** Product and scope authority for Job Engine Batch 03 Work Orders

**Scope authority:** [Job Engine Work Order Status](work-orders/STATUS.md)

**Background:** [Job Engine V1 Product Specification](v1-product-spec.md), [Automation Platform Register](automation/platform-register.md), and [Automation Security Model](automation/security-model.md)

---

## 1. Product definition

Job Engine V2 extends the accepted search product into an embedded application workspace. The owner opens one explicitly selected job in the Job Engine desktop application, reviews the real application page inside an embedded Chromium surface, receives field-level assistance, and explicitly releases the final submission after reviewing the prepared form.

The Batch 03 flow is:

1. The owner opens a job that has a validated application URL and selects a registered resume.
2. Job Engine creates one application run in `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` mode and opens its URL in the embedded browser.
3. The desktop runtime detects the platform and fields, requests backend-owned answer decisions, fills authorized values, uploads the run-scoped resume, and navigates supported intermediate steps while remaining visible.
4. Unknown, sensitive, low-confidence, authentication, CAPTCHA, validation, and unsupported-control cases pause in the same workspace for owner action.
5. At the final step the runtime checkpoints `SUBMIT_ARMED`. The trusted Job Engine UI displays the prepared summary and requires the owner to activate `Submit application`.
6. That explicit action calls `POST /api/v1/application-runs/{run_id}/release-submit`. The same run is reclaimed at `SUBMIT_ARMED`, the runtime activates the site submit control once, and it records confirmed, ambiguous, or failed outcomes truthfully.

The owner controls whether submission occurs. The technical activation remains inside the reconciled runtime so the backend's idempotency, one-click, receipt, and `SUBMISSION_UNKNOWN` guarantees remain enforceable.

```text
[Next.js Job Search and Application Workspace]
                    │ trusted typed IPC
                    ▼
[Electron 43.2.0 Main Process]
  ├── trusted local application renderer
  ├── sandboxed WebContentsView for the selected ATS URL
  ├── dedicated persistent application session
  └── embedded assisted-apply runtime
                    │ loopback REST + SSE
                    ▼
[FastAPI + PostgreSQL]
  ├── applicant profile, answer bank, resume grants
  ├── application run, lease, checkpoint, exception and audit truth
  └── grounded answer decisions and receipt reconciliation
```

---

## 2. Product boundaries

### Included in Batch 03

- One visible, owner-selected application workspace at a time
- Electron desktop shell using a main-process-owned `WebContentsView`
- Dedicated cookies/session storage that never attaches to the owner's normal browser profile
- Generic accessible form observation and filling
- Greenhouse and Lever assisted-apply adapters
- Run-scoped PDF upload
- Grounded and reusable answer decisions with confidence and provenance
- In-context review and exception resolution
- Owner-released final submission
- Resume after application or desktop restart
- Redacted audit, evidence, and receipt states

### Explicitly deferred

- Exposing or launching `FULL_AUTO` from the product UI
- Background multi-job application queues
- Autonomous job selection or application
- Browser extension support
- Ashby, SmartRecruiters, Workday, or employer-specific adapters
- Job scoring, company research, resume tailoring or generation
- CRM pipelines, follow-up reminders, notifications, or application analytics
- Installer, auto-updater, code signing, and production distribution
- CAPTCHA solving, stealth, anti-bot evasion, or access-control bypass

The backend may retain the already-implemented `FULL_AUTO` enum and queue capacity for compatibility. Batch 03 UI and desktop code must not expose, create, or accept `FULL_AUTO` runs.

---

## 3. Fixed ownership and runtime decisions

| Concern | Owner | Fixed decision |
| --- | --- | --- |
| Product UI | `/apps/web` | Existing Next.js/React app remains the trusted renderer and owns visible workspace presentation. |
| Desktop shell | `/apps/desktop` | `electron@43.2.0`; no Tauri, CEF, `<webview>`, deprecated `BrowserView`, or browser extension. |
| Embedded page | Electron main process | One `WebContentsView` showing the selected HTTPS application URL. It is not a DOM child of React. |
| Browser session | Electron main process | Persistent partition dedicated to Job Engine applications; storage outside Git and separate from normal browsers. |
| Form runtime | `/apps/desktop` | Fixed isolated-world observation/fill scripts plus browser-neutral contracts and generic/platform adapters. |
| Durable truth | `/apps/api` + PostgreSQL | Existing BACK-009, BACK-010, and BACK-011 contracts remain authoritative. |
| Test automation | Playwright | Existing `@playwright/test@1.62.1` remains the synthetic fixture and E2E test harness; it is not the product browser runtime. |

The trusted application renderer loads only the exact configured loopback web origin. The remote ATS view has `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, no preload script, no raw IPC, and no access to backend or filesystem capabilities.

The only renderer-to-main bridge is a typed, sender-validated API exposed to the trusted local renderer. It may open a backend-resolved run, set view bounds, close the view, request back/forward/reload, and subscribe to sanitized browser/runtime state. It may not pass arbitrary URLs, JavaScript, headers, filesystem paths, Electron objects, or unrestricted IPC channel names.

---

## 4. Reused backend contracts

No Batch 03 successor order may reopen accepted BACK-009, BACK-010, or BACK-011 behavior merely to make the desktop implementation easier.

### Owner-facing APIs

- `GET|PUT /api/v1/applicant-profile`
- `GET|POST|PATCH|DELETE /api/v1/resumes...`
- `GET|POST|PUT|DELETE /api/v1/answer-bank...`
- `POST /api/v1/application-runs`
- `GET /api/v1/application-runs`
- `GET /api/v1/application-runs/{run_id}`
- `GET /api/v1/application-runs/{run_id}/events/stream`
- `POST /api/v1/application-runs/{run_id}/resolve-answers`
- `POST /api/v1/application-runs/{run_id}/release-submit`
- `POST /api/v1/application-runs/{run_id}/resume`
- `POST /api/v1/application-runs/{run_id}/cancel`
- `POST /api/v1/application-runs/{run_id}/duplicate-override`

### Runner-facing APIs

- `POST /api/v1/runner/claims`
- `POST /api/v1/runner/runs/{run_id}/heartbeat`
- `POST /api/v1/runner/runs/{run_id}/events`
- `POST /api/v1/runner/runs/{run_id}/checkpoints`
- `POST /api/v1/runner/runs/{run_id}/exceptions`
- `POST /api/v1/runner/runs/{run_id}/complete`
- `POST /api/v1/runner/runs/{run_id}/evidence`
- `GET /api/v1/runner/runs/{run_id}/resume-asset`
- `POST /api/v1/runner/runs/{run_id}/answer-decisions`

The desktop runtime authenticates runner calls with the existing bearer secret and lease token. The React renderer never receives those credentials.

---

## 5. Normalized form and decision contract

The runtime converts visible supported controls to the existing `QuestionObservationSchema`:

- `adapter_id`
- `page_id`
- `field_fingerprint`
- `label`
- `accessible_name`
- `help_text`
- `required`
- `control_type`
- `options`
- `validation_constraints`

Stable fingerprints derive from platform, page semantics, accessible label/name, control type, and option semantics. They must not depend only on DOM index, generated CSS class, or volatile element IDs.

The backend returns the existing closed decisions:

- `AUTO_FILL`
- `AUTO_FILL_AND_SUBMIT`
- `REVIEW_REQUIRED`
- `DECLINE_OPTIONAL`
- `ABSTAIN`

For this assisted product, `AUTO_FILL_AND_SUBMIT` authorizes the value but does not remove the final owner release. `REVIEW_REQUIRED` and `ABSTAIN` remain visibly unresolved until the owner resolves them or abandons the run.

---

## 6. Workspace behavior

The desktop workspace contains:

- Job title, company, source, and application origin
- Resume label and checksum summary
- Sandboxed embedded application page
- Browser back, forward, reload, and external-origin-blocked feedback
- Counts for filled, reviewed, and unresolved fields
- Field review list with value, confidence, policy category, provenance, and reason
- Current run status/checkpoint and accessible progress announcements
- Named exception resolution without requesting credentials
- `Submit application` enabled only for the current `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` run at `SUBMIT_ARMED` with no unresolved required field
- Explicit `SUBMITTED`, `SUBMISSION_UNKNOWN`, failure, cancellation, and receipt presentation

The React layout reserves and reports the browser rectangle. Electron positions the `WebContentsView` over that rectangle. The product must remain usable at the minimum supported desktop viewport; no mobile embedded-browser acceptance is required.

Authentication is completed directly inside the embedded page. CAPTCHA and challenge controls are never solved by Job Engine. The runtime pauses mutation, preserves the session, and waits for explicit owner resume.

---

## 7. Navigation, submission, and evidence invariants

1. Electron resolves the initial URL from `GET /api/v1/application-runs/{run_id}`; the renderer cannot supply a URL.
2. Initial navigation must be HTTPS and match the run's canonical application origin/path policy.
3. Redirects, frames, popups, downloads, permission prompts, external protocols, and new-window attempts are denied unless the active adapter explicitly permits the exact HTTPS flow.
4. The embedded page never receives Node, Electron, runner-token, API-token, arbitrary filesystem, or raw IPC access.
5. The runtime uploads only the run-selected PDF returned by its single-use grant and verifies its checksum. Electron main uses stable CDP `DOM.setFileInputFiles` with a per-run OS-temporary file that is deleted immediately after verification and on every failure/shutdown path.
6. Page and job text are untrusted data, never executable instructions for the answering service.
7. Submission requires `SUBMIT_ARMED`, no unresolved required decision, an owner `release-submit` action, and the existing backend idempotency barrier.
8. The site submit control is activated at most once. Timeout or ambiguous navigation becomes `SUBMISSION_UNKNOWN`; it is never retried automatically.
9. `SUBMITTED` requires backend-reconciled receipt evidence.
10. Screenshots, DOM summaries, and logs are bounded and redacted before persistence. Secrets, cookies, hidden values, profile payloads, and resume bytes do not enter committed artifacts.

---

## 8. Work Order sequence

```text
Accepted foundation: BACK-009 + BACK-010 + BACK-011
                         │
                         ▼
CROSS-006 Electron embedded-browser foundation
                         │
                         ▼
CROSS-010 generic form assistance runtime
             ┌───────────┼───────────┐
             ▼           ▼           ▼
         CROSS-007   CROSS-008    FRONT-005
         Greenhouse  Lever        Workspace UI
             └───────────┼───────────┘
                         ▼
CROSS-009 embedded assisted-apply acceptance
```

`CROSS-007`, `CROSS-008`, and `FRONT-005` may proceed in parallel only after `CROSS-010` is `DONE` in `STATUS.md`.

---

## 9. Batch acceptance rule

Batch 03 is complete only when CROSS-009 independently verifies:

- Secure Electron isolation and navigation containment
- Persistent visible application session and restart recovery
- Complete generic, Greenhouse, and Lever synthetic assisted flows
- Grounded field decisions and actionable review states
- Explicit owner release before every final submission
- One-click and ambiguous-submission safeguards
- Resume custody and evidence redaction
- Keyboard-accessible trusted UI and correct browser-view bounds
- Owner-authorized live non-submitting checks for both primary platforms

Fixture success does not establish production ATS support. Live final submission is optional acceptance evidence and requires separate owner authorization for the exact desired job or authorized test target. Absence of live submission evidence must be reported as a conditional production-readiness gate, not worked around with a fabricated application.
