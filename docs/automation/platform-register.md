# V2 Application Platform Register & Runtime Feasibility

**Work order:** [CROSS-005](../work-orders/cross-repo/CROSS-005-high-automation-feasibility-spec.md)

**Retrieved / Evaluated:** 2026-08-17 (UTC)

**Status:** Accepted technical platform register; runtime direction superseded by owner on 2026-08-18

---

## 1. Decision summary

This register records research, first-party legal/terms analysis, technical feasibility, empirical spikes, and platform bindings for Job Engine V2 embedded assisted apply. The 2026-08-17 Playwright runner comparison remains historical evidence; the owner-approved 2026-08-18 product runtime is Electron with a sandboxed `WebContentsView`, while Playwright remains the synthetic/E2E test harness.

### 1.1 Platform Decision Matrix

| Rank | Adapter ID | Operator / Platform Family | Flow Type & Auth | Form Structure | Technical Decision | Permission Classification | Bound Work Order |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `greenhouse` | Greenhouse Software, Inc. | Public web form; no candidate login required | Single-page structured form; custom & EEO sections | `APPROVED_PRIMARY` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | [CROSS-007](../work-orders/cross-repo/CROSS-007-first-platform-automation.md) |
| **2** | `lever` | Lever, Inc. (Employ Inc.) | Public web form; no candidate login required | Single-page clean form; custom fields & EEO survey | `APPROVED_PRIMARY` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | [CROSS-008](../work-orders/cross-repo/CROSS-008-second-platform-automation.md) |
| **3** | `ashby` | Ashby, Inc. | Modern React SPA; optional email verification code | Dynamic single-page / multi-step React components | `APPROVED_BACKUP` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | Backup Rank 1 |
| **4** | `smartrecruiters` | SmartRecruiters, Inc. | Wizard form; optional SmartProfile login | Multi-step wizard with resume parsing and auto-fill | `APPROVED_BACKUP` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | Backup Rank 2 |
| **5** | `workday` | Workday, Inc. | Mandatory per-tenant account creation & login | Complex multi-step wizard | `RESEARCH_ONLY` | `PROHIBITED_WITHOUT_EXPLICIT_PLATFORM_AUTHORIZATION` | Exception-research only |

### 1.2 Named platform-permission gate

- **`LEGAL-GATE-ATS-001` — OPEN:** The first-party materials reviewed below establish candidate-facing application flows but do not expressly authorize automated form interaction. `APPROVED_PRIMARY` and `APPROVED_BACKUP` are technical rankings only. Synthetic fixtures and owner-authorized visual/non-submitting inspection are permitted. Automated mutation or final submission against a live target requires the owner to record legal/risk acceptance for the exact platform and target job, or obtain explicit platform/employer authorization.

---

## 2. Primary Mapping and Downstream Bindings

```text
CROSS-007 -> greenhouse (First approved primary platform)
CROSS-008 -> lever      (Second approved independent primary platform)
```

- **PRIMARY_ATS_ONE_ID**: `greenhouse` (Bound to CROSS-007)
- **PRIMARY_ATS_TWO_ID**: `lever` (Bound to CROSS-008)

Why `greenhouse` and `lever` are approved as primaries:
1. **Pervasive Adoption in Remote Tech**: A large majority of remote international tech jobs aggregated in V1 (via Himalayas, Jobicy, RemoteOK) route to Greenhouse or Lever hosted boards.
2. **Account-Free Application Flow**: Both platforms support frictionless direct submission without requiring per-company candidate accounts, passwords, or email confirmation roundtrips.
3. **Deterministic DOM & Accessible Controls**: Both expose semantic, accessible HTML form controls (`<input>`, `<select>`, `<textarea>`, `<fieldset>`) with stable labels and predictable file-upload inputs.
4. **Independent Architectures**: Greenhouse and Lever have completely independent DOM structures, validation patterns, API submissions, and receipt signals, satisfying the requirement for two independent platform families.

---

## 3. Runtime decision history and current binding

On 2026-08-17 CROSS-005 evaluated three candidates for a separate local automation runner:

1. **Option A: Playwright Persistent Context Runner (initially selected)**
2. **Option B: Chromium Manifest V3 (MV3) Browser Extension**
3. **Option C: Hybrid Design (Playwright + Local Helper Extension)**

First-party runtime sources, retrieved 2026-08-17:

- [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
- [Playwright file uploads](https://playwright.dev/docs/input#upload-files)
- [Playwright pages and popups](https://playwright.dev/docs/pages)
- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome Tabs API and visible-tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabs)

### 3.1 Historical comparison matrix

| Evaluation Dimension | Option A: Playwright Persistent Context | Option B: Manifest V3 Extension | Option C: Hybrid Design |
| :--- | :--- | :--- | :--- |
| **Authentication & Session Continuity** | Excellent. `launchPersistentContext` retains cookies, localStorage, indexedDB across restarts in `JOB_ENGINE_AUTOMATION_PROFILE_DIR`. | Excellent. Runs directly in the user's browser with natural access to existing sessions. | Excellent. Inherits browser profile cookies with Playwright automation hooks. |
| **Multi-Page Navigation & Popups** | Native event-driven handling (`context.on('page')`, `page.waitForNavigation()`, frame navigation listeners). | Complex. MV3 background service workers frequently suspend; tab tracking across popup windows requires extensive `chrome.tabs` messaging. | Complex. Requires bridging Playwright CDP events with extension background message buses. |
| **File Upload Support** | Native, non-blocking `page.setInputFiles(selector, path)`. | No standard extension API grants arbitrary local-file bytes. A user file-picker gesture, native-messaging host, or highly privileged debugger/CDP design would be required and would expand scope. | Functional through the Playwright side; the extension adds no upload capability. |
| **Browser Profile Custody & Locking** | Dedicated directory outside the repository (`~/.job-engine/browser-profile`) with an exclusive process lock. | Can use a dedicated Chrome profile, but installation, permission, and update custody must be managed separately. It must never run in the owner's daily profile. | Can use a dedicated profile but introduces two privileged components and a shared lifecycle. |
| **Headed/Headless & Bot Detection Exposure** | Supports both; Batch 03 binds headed mode. Automation remains detectable and must never be represented as stealth or CAPTCHA avoidance. | Headed only and still potentially detectable. No claim of reduced bot-detection exposure is supported. | Inherits Playwright automation exposure plus extension permissions; no stealth benefit is assumed. |
| **Pause / Resume Lifecycle** | Checkpoint-driven. Process crash or restart recovers safe state from database checkpoints without replaying submit. | Fragile. MV3 service workers terminate after 30s of inactivity; state must be constantly synced to `chrome.storage.local`. | Fragile. Two disparate state machines (runner + extension) must be reconciled on restart. |
| **Screenshot / DOM Evidence & Redaction** | Native `page.screenshot()`, `page.content()`, element handle evaluation with DOM masking before persistence. | Restricted. `chrome.tabs.captureVisibleTab` requires broad `<all_urls>` permission and cannot capture full-page scrolling without stitching. | Functional via Playwright. |
| **Installation, Update & Local Dev** | Clean standard npm package (`playwright@1.62.1` in monorepo). Integrated with pnpm workspace and standard CI/CD. | Complex. Requires developer mode sideloading, unpacked extension loading, and browser restart on extension updates. | Highly complex. Requires maintaining two separate codebases and packaging workflows. |

### 3.2 Superseding 2026-08-18 product decision

The owner replaced the undispatched separate-runner UX with a visible embedded application workspace.

Current first-party runtime sources, retrieved 2026-08-18:

- [Electron 43.2.0 release](https://releases.electronjs.org/release/v43.2.0)
- [Electron web embeds](https://www.electronjs.org/docs/latest/tutorial/web-embeds)
- [Electron `WebContentsView`](https://www.electronjs.org/docs/latest/api/web-contents-view)
- [Electron security checklist](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron debugger / Chrome DevTools Protocol transport](https://www.electronjs.org/docs/latest/api/debugger)
- [Chrome DevTools Protocol `DOM.setFileInputFiles`](https://chromedevtools.github.io/devtools-protocol/tot/DOM/#method-setFileInputFiles)

- **Product shell/runtime:** `electron@43.2.0`
- **Embedded surface:** main-process-owned `WebContentsView`
- **Trusted renderer:** existing `/apps/web` Next.js application loaded from the exact configured loopback origin
- **Remote isolation:** dedicated persistent Electron session; Node disabled; context isolation, sandbox, and web security enabled; no remote preload or raw IPC
- **Assisted runtime:** `/apps/desktop`, accepting only `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`
- **Backend transport:** existing loopback REST + SSE authenticated from Electron main; secrets never enter React or remote content
- **Test harness:** `@playwright/test@1.62.1` for deterministic fixtures/E2E only

Playwright spike results below remain useful proof of synthetic navigation, upload, persistence, and one-time submission behavior, but they no longer bind the product browser architecture. The browser extension remains deferred.

---

## 4. Platform Evaluations & First-Party Evidence

### 4.1 Greenhouse (`greenhouse`)

- **Operator**: Greenhouse Software, Inc.
- **Decision**: `APPROVED_PRIMARY` (Rank 1)
- **Permission Classification**: `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` under `LEGAL-GATE-ATS-001`
- **Implementation Status**: Implemented under [CROSS-007](../work-orders/cross-repo/CROSS-007-first-platform-automation.md) (`apps/desktop/src/main/adapters/greenhouse.ts`)
- **Evaluation / Evidence Date**: 2026-08-19 (UTC)
- **First-Party Documentation & Legal Sources**:
  - [Greenhouse Legal Center](https://www.greenhouse.com/legal) (Retrieved 2026-08-17, Reconfirmed 2026-08-19)
  - [Greenhouse Privacy Policy](https://www.greenhouse.com/privacy-policy) (Retrieved 2026-08-17, Reconfirmed 2026-08-19)
  - [Greenhouse careers-page integration documentation](https://support.greenhouse.io/hc/en-us/articles/11913197669019-Getting-started-with-careers-page-integration) (Retrieved 2026-08-17, Reconfirmed 2026-08-19)
- **First-Party Policy Analysis**:
  - The legal and support materials establish candidate-facing forms and Greenhouse's role as a processor/service provider to employers.
  - The reviewed materials do not expressly authorize a candidate to perform unattended automated submission.
  - Treat technical accessibility as insufficient permission; keep `LEGAL-GATE-ATS-001` open. Live submission requires separate owner authorization for an exact target job.
- **Host Patterns**:
  - `https://boards.greenhouse.io/{company}/jobs/{job_id}` with optional `#app`
  - `https://job-boards.greenhouse.io/{company}/jobs/{job_id}` with optional `#app`
  - `https://boards.eu.greenhouse.io/{company}/jobs/{job_id}` with optional `#app`
  - Reject every other scheme, host, port, credentials, and path; subdomains and lookalikes fail closed.
- **Authentication / Login**: None required for candidate application submissions.
- **Navigation Flow & Form Structure**:
  - Single-page application form located directly on the job posting URL (e.g. `https://boards.greenhouse.io/{company}/jobs/{job_id}#app`).
  - Container element: `#application_form` or `form[action*="greenhouse.io"]`.
- **Form Controls & Question Types**:
  - **Standard Inputs**: First Name (`#first_name`), Last Name (`#last_name`), Email (`#email`), Phone (`#phone`), Resume (`input[type=file]#resume`), Cover Letter (optional file/textarea).
  - **Social Links**: LinkedIn Profile, Website/Portfolio, GitHub Profile.
  - **Custom Questions**: Custom employer questions structured as fieldsets or labeled wrapper `<div>`s containing text inputs, textareas, single-select dropdowns, multi-select checkboxes, and radio buttons.
  - **Demographic / EEO Survey**: Voluntary US EEO sections (Gender, Race/Ethnicity, Veteran Status, Disability Status) located in distinct fieldsets with explicit "Decline to self-identify" / "I choose not to disclose" options.
  - **Legal Attestation & Signature**: Any fields containing consent, attestation, certification, or signature semantics are excluded from auto-fill in `fillStep` and pause for explicit owner review.
- **File Upload Mechanics**:
  - Standard `<input type="file" name="resume">` element.
  - Non-interactive attachment via Electron debugger CDP `DOM.setFileInputFiles`.
  - Verified by inspection of the active attachment DOM element / file name display; temporary file securely deleted immediately upon verification.
- **Anti-Automation & Bot Controls**:
  - Conditional Cloudflare Turnstile / Google reCAPTCHA / auth wall pauses execution with `CAPTCHA` / `NEEDS_AUTH`.
  - Standard rate limiting on form submission POST endpoints.
- **Submission Confirmation & Receipt Signals**:
  - **Success Route / Confirmation Signals**: Presence of `#application_confirmation`, `.application-completed`, or confirmation text (`Application received`, `Thank you for applying`, `Application submitted`).
  - **Receipt Identifier**: Kept `null` under frozen observation contracts until safely exposed by an approved upstream contract.
  - **Ambiguous Response**: Form cleared with unrecognized response or timeout returns `null` receipt and becomes `SUBMISSION_UNKNOWN` without retrying.
- **Testing & Fixture Strategy**:
  - Unit test suite: `apps/desktop/tests/adapters/greenhouse.test.ts` (23 unit tests covering hosts, dual-signal detection, controls, legal filters, submit, receipt, and error cases).
  - Real Electron fixture suite: `apps/desktop/tests/fixtures/greenhouse/greenhouse-runtime.test.ts` (15 fixture cases covering end-to-end lifecycle, upload, conditional reveal, drift tolerance, hostile text isolation, one-time submit, and ambiguous submit).
- **Authorized Live Inspection & Submission Gates**:
  - Live non-submitting inspection gate remains pending owner-authorized exact target.
  - Live submission remains gated under `LEGAL-GATE-ATS-001`.
- **Known Gaps & Maintenance Triggers**:
  - Custom React comboboxes, rich text / contenteditable fields, shadow DOM widgets, or multi-page wizards trigger `UNSUPPORTED` / `NEEDS_ANSWERS` pauses.
  - Platform DOM redesign modifying required identity fields or submit button text triggers detection review.

---

### 4.2 Lever (`lever`)

- **Operator**: Lever, Inc. (Employ Inc.)
- **Decision**: `APPROVED_PRIMARY` (Rank 2)
- **Permission Classification**: `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` under `LEGAL-GATE-ATS-001`
- **First-Party Documentation & Legal Sources**:
  - [Lever Terms of Service](https://www.lever.co/legal/terms-of-service) (Retrieved 2026-08-17)
  - [Lever Privacy Center](https://www.lever.co/privacy) (Retrieved 2026-08-17)
  - [Lever Postings API documentation](https://github.com/lever/postings-api) (Retrieved 2026-08-17)
- **First-Party Policy Analysis**:
  - Lever's Terms of Service govern customer acquisition and use of Lever software; they are not candidate terms and do not grant the asserted candidate-automation permission.
  - The public posting documentation establishes the candidate-facing flow but does not expressly authorize unattended submission automation.
  - Treat the intended use as ambiguous and keep the legal gate open.
- **Host Patterns** (reconfirmed 2026-08-19):
  - `https://jobs.lever.co/{company}/{job_id}` — URL-family match only; **unsupported execution** (plain-anchor posting page; do not click Apply)
  - `https://jobs.lever.co/{company}/{job_id}/apply` — **supported** assisted-apply surface
  - `https://jobs.lever.co/{company}/{job_id}/thanks` — receipt path only
  - Reject every other scheme, host, port, credentialed URL, extra path segment, and redirect that does not re-match one of these patterns
  - `jobs.eu.lever.co` is first-party and **unbound**; do not match it
- **Authentication / Login**: None required for candidate submissions.
- **Navigation Flow**:
  - Dedicated apply page at `/apply` (e.g. `https://jobs.lever.co/{company}/{job_id}/apply`).
  - Container element: `#application-form` or `.application-form`.
- **Form Controls & Question Types**:
  - **Standard Fields**: Full Name (`input[name="name"]`), Email (`input[name="email"]`), Phone (`input[name="phone"]`), Current Company (`input[name="org"]`).
  - **Social / Web Links**: LinkedIn (`input[name="urls[LinkedIn]"]`), GitHub (`input[name="urls[GitHub]"]`), Portfolio (`input[name="urls[Portfolio]"]`), Other website (`input[name="urls[Other]"]`).
  - **Resume Upload**: File input `input[type="file"][name="resume"]` or resume dropzone.
  - **Custom Questions**: Custom employer questions rendered in `.application-question` containers with explicit labels, text inputs, radio groups, and checkboxes.
  - **EEO / Demographic Survey**: Standardized US EEO / diversity survey rendered in `.eeo-section` with explicit opt-out options ("I prefer not to say").
- **File Upload Mechanics**:
  - Standard `<input type="file" name="resume">` plus visible filename / success copy.
  - Synthetic fixtures attach via CROSS-010 CDP `DOM.setFileInputFiles` and verify the displayed filename.
  - Live 100MB-reject copy was observed as static help text only; it was not triggered.
- **Anti-Automation & Bot Controls**:
  - hCaptcha / Turnstile iframes pause as `CAPTCHA` via frozen `ObserveResult.signals.captcha`.
  - Location typeahead can present hCaptcha for suspicious clients (Lever help, 2026-08-19). Do not click location suggestions on live pages.
  - Unlabeled HTTP 429 copy has no dedicated frozen signal; post-submit uncleared/unconfirmed pages are `SUBMISSION_UNKNOWN`.
- **Submission Confirmation / Receipt Signals**:
  - **Success:** approved `/thanks` path with a cleared form, **or** a cleared form plus the generic confirmation boolean (`confirmationText`).
  - **Ambiguous:** `/thanks` with the form still present, or a cleared page with neither thanks path nor confirmation boolean → `captureReceipt() === null` → `SUBMISSION_UNKNOWN` without retry.
- **Fixture support**
  - Synthetic `/apply` matrix: [`apps/desktop/tests/fixtures/lever/`](../apps/desktop/tests/fixtures/lever/) (invented HTML; provenance in `PROVENANCE.md`).
  - jsdom: [`apps/desktop/tests/adapters/lever.test.ts`](../apps/desktop/tests/adapters/lever.test.ts), [`apps/desktop/tests/adapters/adapter-detection-collisions.test.ts`](../apps/desktop/tests/adapters/adapter-detection-collisions.test.ts).
  - Electron mock-API matrix: `lever-runtime-runner.ts` (detect, posting non-advance, collisions, fill, conditional, unresolved `NEEDS_ANSWERS`, upload accept/reject, validation, CAPTCHA, required combobox `UNSUPPORTED`, optional combobox non-blocking, review, confirmed receipt, ambiguous receipt with no second activation, thanks-with-form ambiguous, drift, hostile text).
  - Electron real-backend lifecycle: `lever-lifecycle-runner.ts` (visible fill, verified upload, unresolved required custom field, `READY_FOR_REVIEW`, `submit_armed`, owner `release-submit`, same-run reclaim, exactly one activation, confirmed receipt, ambiguous receipt with no second activation).
- **Authorized read-only inspection**
  - Date: 2026-08-19. `LEGAL-GATE-ATS-001` confirmed OPEN. Load/observe only.
  - Disposable desktop profile via `JOB_ENGINE_DESKTOP_USER_DATA_DIR` outside Git. Two disposable `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` runs were created with backend `application_url` values exactly equal to the posting URL and the `/apply` URL. Each was opened through `fetchApplicationRun` then `ApplicationViewManager.openApplication(runId, applicationUrl)` in the product shell against a trusted loopback web origin. Lever CTAs were not clicked.
  - URLs:
    - `https://jobs.lever.co/Osmind/49c5fbef-757c-40bb-9f60-ae09bc1f5f29` (posting)
    - `https://jobs.lever.co/Osmind/49c5fbef-757c-40bb-9f60-ae09bc1f5f29/apply` (apply)
  - Posting: title “Osmind - Senior Software Engineer, Brazil”; plain “APPLY FOR THIS JOB” anchors to `/apply`; no application form. Unsupported execution.
  - Apply: Resume/CV file input `name=resume` with an ATTACH RESUME/CV control; required Full name (`name=name`) and Email; Phone; Current location as a native text input `name=location` (typeahead suggestions were not opened); Current company; LinkedIn/Twitter/GitHub/Portfolio URL; two required custom card textareas; voluntary EEO selects (Gender/Race/Veteran) including “Decline to self-identify”; optional extra demographic survey; hidden `h-captcha-response` with no visible challenge iframe; submit control “SUBMIT APPLICATION”.
  - The embedded view was closed after each load. No `submitting` checkpoint and no completed-as-submitted status. The throwaway inspection database was dropped. No Osmind HTML, screenshots, or personal data were copied into Git.
  - FRONT-005 still must wire trusted-UI `openApplication({ runId })` and call `detect()` before `StepRunner`. This inspection used the existing main-process `openApplication` method, not that UI.
- **Live mutation evidence**
  - none
- **Live submission evidence**
  - none
- **Production readiness**
  - not claimed. `LEGAL-GATE-ATS-001` remains OPEN. FRONT-005 must resolve `createDefaultAdapterRegistry()` and call `detect()` before `StepRunner`; CROSS-009 accepts that wiring. EU host unbound. Posting pages unsupported. Optional composites do not pause.
- **Known Gaps & Maintenance Triggers**:
  - `jobs.eu.lever.co` is first-party and unbound.
  - Posting-page plain anchors are never auto-clicked.
  - Optional location/university comboboxes are observed as unsupported hints and do not block `READY_FOR_REVIEW`.
  - Required custom comboboxes / signature widgets pause as `UNSUPPORTED`.
  - Production desktop does not yet call `detect()` or the default registry.

---

### 4.3 Ashby (`ashby`)

- **Operator**: Ashby, Inc.
- **Decision**: `APPROVED_BACKUP` (Rank 1 Backup)
- **Permission Classification**: `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` under `LEGAL-GATE-ATS-001`
- **First-Party Documentation & Legal Sources**:
  - [Ashby Terms](https://www.ashbyhq.com/terms) (Retrieved 2026-08-17)
  - [Ashby Privacy Policy](https://www.ashbyhq.com/privacy) (Retrieved 2026-08-17)
  - [Ashby Candidate Experience](https://www.ashbyhq.com/product/candidate-experience) (Retrieved 2026-08-17)
- **First-Party Policy Analysis**:
  - The materials describe candidate-facing job pages but do not expressly authorize unattended automated submissions.
  - Technical backup ranking does not resolve permission; owner/legal acceptance remains required.
- **Host Patterns**:
  - `https://jobs.ashbyhq.com/{company}/{job_id}`
  - `https://jobs.ashbyhq.com/{company}/{job_id}/application`
- **Authentication / Login**: None required by default; optional email one-time passcode (OTP) verification enabled by certain employers.
- **Navigation Flow**: Single-page dynamic React application with reactive state.
- **Form Structure**: Rich interactive form with client-side reactive validation, auto-complete dropdowns, and file-picker components.
- **Anti-Automation Controls**: Cloudflare Turnstile embedded on form submission.
- **Why Backup**: While terms and features are strong, Ashby uses dynamic client-side React state and occasional OTP email challenges that require user interaction, making it a secondary candidate behind Greenhouse and Lever for the initial primary automation adapters.

---

### 4.4 SmartRecruiters (`smartrecruiters`)

- **Operator**: SmartRecruiters, Inc.
- **Decision**: `APPROVED_BACKUP` (Rank 2 Backup)
- **Permission Classification**: `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` under `LEGAL-GATE-ATS-001`
- **First-Party Documentation & Legal Sources**:
  - [SmartRecruiters Candidate Terms of Use](https://www.smartrecruiters.com/legal/terms-of-use/) (Retrieved 2026-08-17)
  - [SmartRecruiters Candidate Privacy Policy](https://www.smartrecruiters.com/legal/candidate-privacy-policy/) (Retrieved 2026-08-17)
- **First-Party Policy Analysis**:
  - Candidate terms allow candidates to maintain accounts and applications, and restrict certain automatic access to other users' content/data.
  - They do not expressly authorize unattended application submission; the prior permitted-use conclusion was unsupported.
- **Host Patterns**:
  - `https://jobs.smartrecruiters.com/{company}/{job_id}/{slug}`
  - `https://jobs.smartrecruiters.com/{company}/{job_id}/{slug}/apply`
- **Authentication / Login**: Optional candidate account ("SmartProfile"); allows unauthenticated guest application.
- **Navigation Flow**: Multi-step wizard (Personal Info -> Experience -> Additional Questions -> Review).
- **Anti-Automation Controls**: Bot protection and session fingerprinting.
- **Why Backup**: Multi-step wizard requires navigating between distinct wizard steps with intermediate server validation, making it an ideal candidate for subsequent platform expansion.

---

### 4.5 Workday (`workday`)

- **Operator**: Workday, Inc.
- **Decision**: `RESEARCH_ONLY`
- **Permission Classification**: `PROHIBITED_WITHOUT_EXPLICIT_PLATFORM_AUTHORIZATION`
- **First-Party Documentation & Legal Sources**:
  - [Workday Legal Center](https://www.workday.com/en-us/legal.html) (Retrieved 2026-08-17)
  - [Workday Privacy Statement](https://www.workday.com/en-us/privacy.html) (Retrieved 2026-08-17)
- **First-Party Policy Analysis**:
  - Workday operates as a vendor to employer enterprises; candidate portals are tenant-specific enterprise deployments.
  - No reviewed candidate-facing material grants unattended automation permission for tenant portals. Do not automate without explicit platform/employer authorization.
- **Host Patterns**:
  - Tenant-specific HTTPS hosts ending in `.myworkdayjobs.com`; no path is approved for automation while this platform remains `RESEARCH_ONLY`.
- **Authentication / Login**: **Mandatory Account Creation**. Every employer tenant requires creating and verifying a separate user account with password and email validation.
- **Navigation Flow**: Multi-step dynamic wizard with heavy JavaScript, dynamic GUID selectors, nested shadow DOM components, and strict session expiration timers.
- **Why Research Only**: Mandatory per-tenant account creation, volatile DOM structure, and strict session timeouts conflict with high-automation unattended execution in Batch 03. It is reserved for dedicated exception-driven research.

---

## 5. Empirical Spikes and Reproducible Verification Record

To validate Playwright Chromium for document-to-document navigation, file upload, persistent authentication, checkpoint recovery after browser restart, one-time submission, and receipt detection, we executed the following disposable synthetic spike. It made no network request to an ATS and used no personal data.

### 5.1 Spike Environment and Tooling
- **Node.js**: `v24.18.0`
- **Playwright**: `1.62.1` (`@playwright/test`)
- **Browser**: Chromium (Playwright bundled)
- **Execution Date**: 2026-08-17T23:51:00-03:00
- **Command**: from repository root, `node /tmp/cross005-spike-final.cjs`
- **Environment note**: Chromium required execution outside the container sandbox; its first sandboxed launch failed before the browser opened. The unsandboxed local run below exited 0.

### 5.2 Exact executed spike script (`/tmp/cross005-spike-final.cjs`)

```javascript
const { createRequire } = require("node:module");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { pathToFileURL } = require("node:url");

const repoRequire = createRequire(path.join(process.cwd(), "apps/web/package.json"));
const { chromium } = repoRequire("@playwright/test");

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "job-engine-cross005-"));
  const profile = path.join(root, "profile");
  const checkpointPath = path.join(root, "checkpoint.json");
  try {
    fs.writeFileSync(path.join(root, "step-1.html"), `<!doctype html><input id="email"><a id="next" href="step-2.html">Continue</a>`);
    fs.writeFileSync(path.join(root, "step-2.html"), `<!doctype html><input id="resume" type="file"><button id="submit" onclick="this.disabled=true;receipt.hidden=false">Submit</button><p id="receipt" hidden>RECEIPT-SYNTHETIC-001</p>`);
    fs.writeFileSync(path.join(root, "resume.pdf"), "%PDF-1.4\n% synthetic fixture\n%%EOF\n");
    console.log(`spike_root=${root}`);

    const first = await chromium.launchPersistentContext(profile, { headless: true });
    const page1 = first.pages()[0] || await first.newPage();
    await page1.goto(pathToFileURL(path.join(root, "step-1.html")).href);
    await page1.fill("#email", "jane.doe@example.test");
    await Promise.all([page1.waitForURL(/step-2\.html$/), page1.click("#next")]);
    await first.addCookies([{ name: "synthetic_session", value: "authenticated", url: "https://example.com", expires: Math.floor(Date.now() / 1000) + 3600 }]);
    fs.writeFileSync(checkpointPath, JSON.stringify({ safe_stage: "STEP_2_READY", next_url: page1.url(), completed_actions: ["fill-contact", "advance-step-1"] }));
    await first.close();
    console.log("phase1 navigation=step-1->step-2 checkpoint=STEP_2_READY");

    const checkpoint = JSON.parse(fs.readFileSync(checkpointPath, "utf8"));
    const second = await chromium.launchPersistentContext(profile, { headless: true });
    const cookies = await second.cookies("https://example.com");
    if (!cookies.some((cookie) => cookie.name === "synthetic_session" && cookie.value === "authenticated")) throw new Error("persistent session missing");
    const page2 = second.pages()[0] || await second.newPage();
    await page2.goto(checkpoint.next_url);
    await page2.setInputFiles("#resume", path.join(root, "resume.pdf"));
    if (!(await page2.locator("#resume").evaluate((input) => input.files.length === 1))) throw new Error("upload missing");
    await page2.click("#submit");
    const receipt = await page2.locator("#receipt").textContent();
    if (receipt !== "RECEIPT-SYNTHETIC-001" || !(await page2.locator("#submit").isDisabled())) throw new Error("receipt missing");
    if (checkpoint.completed_actions.filter((action) => action === "advance-step-1").length !== 1) throw new Error("action replayed");
    await second.close();
    console.log(`phase2 session=persisted resumed=${checkpoint.safe_stage} upload=1 receipt=${receipt} submit_clicks=1 replayed_actions=0`);
    console.log("result=PASS cleanup=complete");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
```

### 5.3 Spike Execution Transcript

```text
spike_root=/tmp/job-engine-cross005-zeu3lo
phase1 navigation=step-1->step-2 checkpoint=STEP_2_READY
phase2 session=persisted resumed=STEP_2_READY upload=1 receipt=RECEIPT-SYNTHETIC-001 submit_clicks=1 replayed_actions=0
result=PASS cleanup=complete
```

### 5.4 Empirical Findings
1. **Multi-Page Navigation**: Playwright followed a real navigation from `step-1.html` to a distinct `step-2.html` document.
2. **File Upload Attachment**: `setInputFiles` attached one synthetic local PDF without an OS dialog.
3. **Browser Restart / Checkpoint Resume**: The first persistent context wrote `STEP_2_READY` and closed. A newly launched browser process recovered its cookie and checkpoint, resumed directly at step 2, and verified that the step-1 action appeared exactly once.
4. **Confirmation Detection**: The resumed run activated submit once, observed the synthetic receipt, and verified the submit control was disabled.
5. **Bounded Claim**: This proves local runtime primitives only. It does not prove live ATS permission, selector durability, production authentication, or platform submission support; those remain gated by platform Work Orders and `LEGAL-GATE-ATS-001`.

---

## 6. Batch 04 coverage evidence (CROSS-014)

**Report:** [application-platform-coverage.md](application-platform-coverage.md)
**Frozen inventory:** `apps/api/tests/fixtures/application_platform_inventory.json`
**Registry:** `apps/desktop/src/main/adapters/registry.ts` (`classify`, hostile lookalike via suffix+infix)
**Selection:** `apps/desktop/src/main/adapters/selection.ts` (`selectAdapter`, visible-URL veto; called from `RuntimeCoordinator` private `selectAdapter`)

| Adapter ID | CROSS-014 coverage tier | Notes |
| --- | --- | --- |
| `greenhouse` | `AUTO_SUPPORTED` | Exact-host matcher; `test:production` Greenhouse full-auto submitted |
| `lever` | `AUTO_SUPPORTED` | Exact-host matcher; `/apply`-only detect; `test:production` Lever full-auto submitted |
| `generic` | `AUTO_SUPPORTED` | HTTPS employer standard forms after platform matchers; also soft-fallback for Greenhouse/Lever `UNAPPROVED_ATS_PATH`; production full-auto + semi-auto |
| `ashby` | `UNSUPPORTED` (`MISSING_ADAPTER_EVIDENCE`) | Matcher module present but **unregistered**; exact `jobs.ashbyhq.com` hard-vetoed — does not fall through to generic; does not count toward auto-supported coverage |
| `smartrecruiters` | `UNSUPPORTED` (`MISSING_ADAPTER_EVIDENCE`) | Matcher module present but **unregistered**; exact `jobs.smartrecruiters.com` hard-vetoed; does not count toward auto-supported coverage |
| `workday` | `UNSUPPORTED` (`LEGAL_GATE`) | Detector only; never generic fallback; does not count toward auto-supported coverage |
| unbound Lever EU | `UNSUPPORTED` (`MISSING_ADAPTER_EVIDENCE`) | `jobs.eu.lever.co` — not labelled lookalike |
| feed listing hosts | `UNSUPPORTED` (`FEED_LISTING_UNRESOLVED`) | Catalog stores listing URLs, not ATS apply hosts |

**Measurability (2026-08-20):** Committed source fixtures yield 0 resolvable / 9 feed-listing URLs (3 templated families). Owner option (b) dual-number reporting applies; ≥95% criterion escalates as unmeasurable (option c) until ingestion stores downstream apply URLs.

**Inventory (option c):** 9 distinct feed-listing URLs / 3 path families / 0 resolvable; ≥95% unmeasurable. See [application-platform-coverage.md](application-platform-coverage.md) (`cross-014-v4`).

**Production numerator:** 3/3 standard-form families (generic, Greenhouse, Lever) via `test:production`. Ashby/SmartRecruiters/Workday excluded. CROSS-014 is **not** acceptance-complete while resolvable catalog URLs remain absent.
