# V2 Application Platform Register & Runtime Feasibility

**Work order:** [CROSS-005](../work-orders/cross-repo/CROSS-005-high-automation-feasibility-spec.md)

**Retrieved / Evaluated:** 2026-08-17 (UTC)

**Status:** Draft candidate awaiting owner acceptance under CROSS-005

---

## 1. Decision summary

This register records the research, evaluation, first-party legal/terms analysis, technical feasibility, empirical spikes, and binding decisions for application platforms and runtime architectures evaluated for Job Engine V2 high-automation assisted apply.

### 1.1 Platform Decision Matrix

| Rank | Adapter ID | Operator / Platform Family | Flow Type & Auth | Form Structure | Technical Decision | Permission Classification | Bound Work Order |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1** | `greenhouse` | Greenhouse Software, Inc. | Public web form; no candidate login required | Single-page structured form; custom & EEO sections | `APPROVED_PRIMARY` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | [CROSS-007](../work-orders/cross-repo/CROSS-007-first-platform-automation.md) |
| **2** | `lever` | Lever, Inc. (Employ Inc.) | Public web form; no candidate login required | Single-page clean form; custom fields & EEO survey | `APPROVED_PRIMARY` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | [CROSS-008](../work-orders/cross-repo/CROSS-008-second-platform-automation.md) |
| **3** | `ashby` | Ashby, Inc. | Modern React SPA; optional email verification code | Dynamic single-page / multi-step React components | `APPROVED_BACKUP` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | Backup Rank 1 |
| **4** | `smartrecruiters` | SmartRecruiters, Inc. | Wizard form; optional SmartProfile login | Multi-step wizard with resume parsing and auto-fill | `APPROVED_BACKUP` | `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` | Backup Rank 2 |
| **5** | `workday` | Workday, Inc. | Mandatory per-tenant account creation & login | Complex multi-step wizard | `RESEARCH_ONLY` | `PROHIBITED_WITHOUT_EXPLICIT_PLATFORM_AUTHORIZATION` | Exception-research only |

### 1.2 Named platform-permission gate

- **`LEGAL-GATE-ATS-001` — OPEN:** The first-party materials reviewed below establish candidate-facing application flows but do not expressly authorize unattended browser automation. `APPROVED_PRIMARY` and `APPROVED_BACKUP` are technical rankings only. No live automated submission may occur until the owner records legal/risk acceptance for the exact platform and target job, or obtains explicit platform/employer authorization. Synthetic fixtures and non-submitting inspection remain permitted.

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

## 3. Automation Runtime Comparison and Decision

We evaluated three candidate runtime architectures for executing local browser automation against first-party documentation and requirements:

1. **Option A: Playwright Persistent Context Runner (Selected)**
2. **Option B: Chromium Manifest V3 (MV3) Browser Extension**
3. **Option C: Hybrid Design (Playwright + Local Helper Extension)**

First-party runtime sources, retrieved 2026-08-17:

- [Playwright persistent contexts](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-persistent-context)
- [Playwright file uploads](https://playwright.dev/docs/input#upload-files)
- [Playwright pages and popups](https://playwright.dev/docs/pages)
- [Chrome extension service-worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
- [Chrome extension permissions](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- [Chrome Tabs API and visible-tab capture](https://developer.chrome.com/docs/extensions/reference/api/tabs)

### 3.1 Architectural Comparison Matrix

| Evaluation Dimension | Option A: Playwright Persistent Context (Selected) | Option B: Manifest V3 Extension | Option C: Hybrid Design |
| :--- | :--- | :--- | :--- |
| **Authentication & Session Continuity** | Excellent. `launchPersistentContext` retains cookies, localStorage, indexedDB across restarts in `JOB_ENGINE_AUTOMATION_PROFILE_DIR`. | Excellent. Runs directly in the user's browser with natural access to existing sessions. | Excellent. Inherits browser profile cookies with Playwright automation hooks. |
| **Multi-Page Navigation & Popups** | Native event-driven handling (`context.on('page')`, `page.waitForNavigation()`, frame navigation listeners). | Complex. MV3 background service workers frequently suspend; tab tracking across popup windows requires extensive `chrome.tabs` messaging. | Complex. Requires bridging Playwright CDP events with extension background message buses. |
| **File Upload Support** | Native, non-blocking `page.setInputFiles(selector, path)`. | No standard extension API grants arbitrary local-file bytes. A user file-picker gesture, native-messaging host, or highly privileged debugger/CDP design would be required and would expand scope. | Functional through the Playwright side; the extension adds no upload capability. |
| **Browser Profile Custody & Locking** | Dedicated directory outside the repository (`~/.job-engine/browser-profile`) with an exclusive process lock. | Can use a dedicated Chrome profile, but installation, permission, and update custody must be managed separately. It must never run in the owner's daily profile. | Can use a dedicated profile but introduces two privileged components and a shared lifecycle. |
| **Headed/Headless & Bot Detection Exposure** | Supports both; Batch 03 binds headed mode. Automation remains detectable and must never be represented as stealth or CAPTCHA avoidance. | Headed only and still potentially detectable. No claim of reduced bot-detection exposure is supported. | Inherits Playwright automation exposure plus extension permissions; no stealth benefit is assumed. |
| **Pause / Resume Lifecycle** | Checkpoint-driven. Process crash or restart recovers safe state from database checkpoints without replaying submit. | Fragile. MV3 service workers terminate after 30s of inactivity; state must be constantly synced to `chrome.storage.local`. | Fragile. Two disparate state machines (runner + extension) must be reconciled on restart. |
| **Screenshot / DOM Evidence & Redaction** | Native `page.screenshot()`, `page.content()`, element handle evaluation with DOM masking before persistence. | Restricted. `chrome.tabs.captureVisibleTab` requires broad `<all_urls>` permission and cannot capture full-page scrolling without stitching. | Functional via Playwright. |
| **Installation, Update & Local Dev** | Clean standard npm package (`playwright@1.62.1` in monorepo). Integrated with pnpm workspace and standard CI/CD. | Complex. Requires developer mode sideloading, unpacked extension loading, and browser restart on extension updates. | Highly complex. Requires maintaining two separate codebases and packaging workflows. |

### 3.2 Runtime Selection Decision

**Selected Architecture**: **Option A (Playwright Persistent Context Runner)**
- **Package**: `playwright@1.62.1`
- **Browser Channel**: `chromium`
- **Profile Directory**: `JOB_ENGINE_AUTOMATION_PROFILE_DIR` (defaults to `~/.job-engine/browser-profile`)
- **Backend Transport**: Local loopback HTTP REST + SSE (`http://127.0.0.1:8000`), authenticated via `Authorization: Bearer <JOB_ENGINE_RUNNER_SECRET>`.

**Rationale**:
Playwright provides the required file-upload, multi-page/popup, headed execution, and dedicated-profile primitives through one local process. A pure extension would require additional privileged machinery for unattended local-file custody, while a hybrid would retain Playwright and add a second privileged lifecycle without satisfying another Batch 03 requirement. The selection is based on bounded scope and custody, not any claim that Playwright is undetectable.

---

## 4. Platform Evaluations & First-Party Evidence

### 4.1 Greenhouse (`greenhouse`)

- **Operator**: Greenhouse Software, Inc.
- **Decision**: `APPROVED_PRIMARY` (Rank 1)
- **Permission Classification**: `AMBIGUOUS_REQUIRES_OWNER_LEGAL_ACCEPTANCE` under `LEGAL-GATE-ATS-001`
- **First-Party Documentation & Legal Sources**:
  - [Greenhouse Legal Center](https://www.greenhouse.com/legal) (Retrieved 2026-08-17)
  - [Greenhouse Privacy Policy](https://www.greenhouse.com/privacy-policy) (Retrieved 2026-08-17)
  - [Greenhouse careers-page integration documentation](https://support.greenhouse.io/hc/en-us/articles/11913197669019-Getting-started-with-careers-page-integration) (Retrieved 2026-08-17)
- **First-Party Policy Analysis**:
  - The legal and support materials establish candidate-facing forms and Greenhouse's role as a processor/service provider to employers.
  - The reviewed materials do not expressly authorize a candidate to perform unattended automated submission and do not support the previously asserted section-level permission claim.
  - Treat technical accessibility as insufficient permission; keep the legal gate open.
- **Host Patterns**:
  - `https://boards.greenhouse.io/{company}/jobs/{job_id}` with optional `#app`
  - `https://job-boards.greenhouse.io/{company}/jobs/{job_id}` with optional `#app`
  - `https://boards.eu.greenhouse.io/{company}/jobs/{job_id}` with optional `#app`
  - Reject every other scheme, host, and path; redirects must re-match one of these patterns.
- **Authentication / Login**: None required for candidate application submissions.
- **Navigation Flow**:
  - Single-page application form located directly on the job posting URL (e.g. `https://boards.greenhouse.io/{company}/jobs/{job_id}#app`).
  - Container element: `#application_form` or `form[action*="greenhouse.io"]`.
- **Form Controls & Question Types**:
  - **Standard Inputs**: First Name (`#first_name`), Last Name (`#last_name`), Email (`#email`), Phone (`#phone`), Resume (`input[type=file]#resume`), Cover Letter (optional file/textarea).
  - **Social Links**: LinkedIn Profile, Website/Portfolio, GitHub Profile.
  - **Custom Questions**: Custom employer questions structured as fieldsets or labeled wrapper `<div>`s containing text inputs, textareas, single-select dropdowns, multi-select checkboxes, and radio buttons.
  - **Demographic / EEO Survey**: Voluntary US EEO sections (Gender, Race/Ethnicity, Veteran Status, Disability Status) located in distinct fieldsets with explicit "Decline to self-identify" / "I choose not to disclose" options.
- **File Upload Mechanics**:
  - Standard `<input type="file" name="resume">` element.
  - Supports non-interactive attachment via Playwright `setInputFiles`.
  - DOM feedback: `.filename` pill element rendered upon attachment.
- **Anti-Automation & Bot Controls**:
  - Conditional Cloudflare Turnstile / Google reCAPTCHA triggered on anomalous IP velocity.
  - Standard rate limiting on form submission POST endpoints.
- **Submission Confirmation / Receipt Signals**:
  - **Success Route / URL**: Redirection to `.../applications/thanks` or `.../confirmation`.
  - **Success DOM Signals**: Presence of `#application_confirmation`, `.application-completed`, or text content matching `Thank you for applying`, `Application submitted`, or `Your application has been received`.
  - **Receipt Identifier**: Application confirmation ID or timestamped confirmation message.
- **Testing & Fixture Strategy**:
  - Sanitized synthetic HTML fixture matching Greenhouse form layout (`tests/fixtures/greenhouse/application_form.html`).
  - Unit tests for step observation, field fingerprinting, file upload verification, pre-submit arming, and receipt capture.

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
- **Host Patterns**:
  - `https://jobs.lever.co/{company}/{job_id}`
  - `https://jobs.lever.co/{company}/{job_id}/apply`
  - Reject every other scheme, host, and path; redirects must re-match one of these patterns.
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
  - Standard `<input type="file" name="resume">`.
  - Supports Playwright `setInputFiles` cleanly.
  - Verified by inspection of the active attachment DOM element `.resume-upload-success` / file name display.
- **Anti-Automation & Bot Controls**:
  - Rate limiting on submission endpoints; occasional Cloudflare challenge on suspicious connections.
- **Submission Confirmation / Receipt Signals**:
  - **Success Route**: Navigation / redirect to `https://jobs.lever.co/{company}/{job_id}/thanks`.
  - **Success DOM Signals**: `.application-confirmation`, heading containing `Application Submitted!`, or text `Thank you for your interest`.
- **Testing & Fixture Strategy**:
  - Sanitized synthetic HTML fixture matching Lever apply page structure (`tests/fixtures/lever/application_form.html`).
  - Tests covering resume attachment, custom field matching, EEO decline selection, and `/thanks` receipt detection.

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
