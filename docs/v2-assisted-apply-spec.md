# Job Engine V2 Assisted Apply Specification

**Status:** Draft candidate awaiting owner acceptance under CROSS-005

**Purpose:** Product and scope authority for Job Engine Batch 03 Work Orders

**Scope authority:** [Job Engine Work Order Status](work-orders/STATUS.md)

**Background:** [Job Engine V1 Product Specification](v1-product-spec.md) and [Automation Platform Register](automation/platform-register.md)

---

## 1. Product definition

Job Engine V2 Assisted Apply extends Job Engine from search and aggregation to high-automation application completion and submission. 

The core V2 experience is:
1. The user selects one or more open opportunities in the Job Engine search UI, selects a registered resume asset, and chooses an automation mode (`FULL_AUTO` or `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`).
2. The user initiates application queueing once via `Apply automatically`.
3. The local automation runner claims queued runs, navigates multi-step ATS forms, observes controls, fills validated profile and reusable answer values, generates grounded answers for custom questions, attaches the selected resume PDF, and executes final submission without requiring a routine second confirmation click when in `FULL_AUTO`.
4. Human attention is required only when an exception occurs: expired authentication, CAPTCHA challenge, unsupported custom controls, missing profile information, unapproved sensitive questions, confidence below the safety threshold, or when `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` mode is selected.
5. The runner captures receipt evidence, stores an audit snapshot, and records terminal status.

```text
[User selects Job(s) + Resume + Mode in UI]
                     │
                     ▼
[POST /api/v1/application-runs] -> [FastAPI Application Queue & Vault]
                                                 │
                                                 ▼ (Local REST + Bearer Secret)
                                  [Local Playwright Runner (/apps/automation)]
                                                 │
                                                 ├──> [Dedicated Chromium Profile]
                                                 ├──> [Observe DOM & Form Controls]
                                                 ├──> [Fetch Answering Decisions (Grounded/Deterministic)]
                                                 ├──> [Attach Run-Scoped Resume PDF]
                                                 ├──> [Pre-Submit Idempotency Check]
                                                 ├──> [1-Time Click Final Submission]
                                                 └──> [Capture Receipt & Redacted Evidence]
```

---

## 2. Target user and scope baseline

V2 has one user: the repository owner, applying to software engineering and tech roles.

The V2 specification preserves all owner decisions:
1. **Unattended Submission**: Normal runs on supported platforms proceed through final submission automatically in `FULL_AUTO` mode.
2. **Zero Routine Review Click**: There is no mandatory final review click for successful standard runs in `FULL_AUTO`.
3. **Exception-Driven Intervention**: The runner pauses only for genuine exceptions (`NEEDS_INPUT`, `PAUSED_AUTH`, `CAPTCHA`).
4. **No Autonomous Job Selection**: In Batch 03, every run originates from an explicit user selection in Job Engine. The engine does not autonomously crawl and apply to arbitrary jobs.
5. **Local Architecture**: No third-party browser farms, message brokers (RabbitMQ/Kafka/Redis), or cloud workflow platforms. The runner runs locally on the user's workstation.
6. **Resume File Privacy**: Personal resumes remain strictly local, ignored by Git, and are never copied into fixtures, logs, or public repositories.

---

## 3. Automation Modes

Job Engine V2 defines two explicit automation modes:

| Mode Identifier | Semantics |
| :--- | :--- |
| `FULL_AUTO` | The runner claims the run, fills all observed form fields, attaches the resume, resolves grounded answers, checkpoints `SUBMIT_ARMED`, and triggers final submission automatically without pausing for user confirmation on normal success. Pauses only on genuine exceptions. |
| `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` | The runner completes all page navigation, form field entry, file attachment, and question answering, checkpoints `SUBMIT_ARMED`, and then deliberately transitions to `NEEDS_INPUT` with an armed pre-submit summary. The user inspects the prepared application in the UI and calls `POST /api/v1/application-runs/{run_id}/release-submit` through `Submit Application`; the backend verifies the mode/checkpoint and requeues the same run at `SUBMIT_ARMED`. |

---

## 4. Fixed data contracts

### 4.1 Applicant Profile Schema

The profile represents singleton applicant information stored in PostgreSQL:

| Field | Type | Policy Category | Description |
| :--- | :--- | :--- | :--- |
| `first_name` | string | `VERIFIED_PROFILE` | Legal / preferred first name |
| `last_name` | string | `VERIFIED_PROFILE` | Legal / preferred last name |
| `email` | email | `VERIFIED_PROFILE` | Primary contact email |
| `phone` | string | `VERIFIED_PROFILE` | International format phone number (e.g. `+55...`) |
| `city` | string | `VERIFIED_PROFILE` | Current city of residence |
| `region` | string | `VERIFIED_PROFILE` | State / province |
| `country` | string | `VERIFIED_PROFILE` | Country of residence (e.g. `Brazil`) |
| `linkedin_url` | url | `VERIFIED_PROFILE` | Public LinkedIn profile URL |
| `github_url` | url | `VERIFIED_PROFILE` | Public GitHub profile URL |
| `portfolio_url` | url | `VERIFIED_PROFILE` | Personal portfolio / website URL |
| `employment_history` | array | `VERIFIED_PROFILE` | Structured past employment roles & dates |
| `education_history` | array | `VERIFIED_PROFILE` | Degrees, institutions, and dates |
| `skills` | array[string] | `VERIFIED_PROFILE` | Technology terms & competencies |

### 4.2 Resume Catalog Metadata

```json
{
  "resume_id": "res_default_fullstack",
  "label": "Guilherme Fortuna - Senior Full Stack Engineer",
  "source_markdown_path": "docs/resume/Guilherme_Fortuna_Resume.md",
  "upload_pdf_path": "docs/resume/Guilherme_Fortuna_Resume.pdf",
  "preview_html_path": "docs/resume/Guilherme_Fortuna_Resume_1Page.html",
  "sha256": "3a8b...lowercase_hex",
  "language": "en",
  "is_default": true
}
```

### 4.3 Reusable Answer Bank Schema

```json
{
  "answer_id": "ans_work_auth_us",
  "question_intent": "work_authorization",
  "jurisdiction": "US",
  "answer_text": "Authorized to work via B2B contract / requires visa sponsorship for W2",
  "policy_category": "APPROVED_REUSABLE",
  "provenance": "owner_authored",
  "last_confirmed_at": "2026-08-17T00:00:00Z",
  "expires_at": null
}
```

### 4.4 Application Run State Machine

The state machine is closed and identical across backend, runner, and frontend:

```text
  +---------+
  | QUEUED  | <───────────────────────────────────────────+
  +----+----+                                             |
       |                                                  |
       | Claim lease                                      |
       v                                                  |
  +---------+                                             |
  | CLAIMED |                                             |
  +----+----+                                             |
       |                                                  |
       | Launch browser                                   |
       v                                                  |
  +---------+       Exception / SEMI_AUTO Armed        +-------------+
  | RUNNING | ────────────────────────────────────────>| NEEDS_INPUT |
  +----+----+                                          +------+------+
       |                                                      |
       |                               Resolve input / Release|
       |                                                      v
       |                                               +-------------+
       |                                               |   QUEUED    |
       |                                               +-------------+
       |
       | Exception (Auth / CAPTCHA)                    +-------------+
       +──────────────────────────────────────────────>| PAUSED_AUTH |
       |                                               +------+------+
       |                                                      |
       |                                       Owner logged in|
       |                                                      v
       |                                               +-------------+
       |                                               |   QUEUED    |
       |                                               +-------------+
       |
       | Transient crash / retryable error             +------------------+
       +──────────────────────────────────────────────>| FAILED_RETRYABLE | ──> (Requeue)
       |                                               +------------------+
       |
       | Fatal error / Exceeded retry limit            +--------------+
       +──────────────────────────────────────────────>| FAILED_FINAL | [TERMINAL]
       |                                               +--------------+
       |
       | Cancelled by owner                            +-----------+
       +──────────────────────────────────────────────>| CANCELLED | [TERMINAL]
       |                                               +-----------+
       |
       | Pre-submit armed & 1-time submit attempt
       +---------------- confirmed receipt ----------------> SUBMITTED [TERMINAL]
       |
       +---------------- ambiguous/timeout ----------------> SUBMISSION_UNKNOWN [TERMINAL]
```

---

## 5. Field policy matrix and answering rules

Every observed form control must map to a closed policy category before an action is taken:

| Policy Category | Evaluation Method | Permitted Runner Action | Failure / Fallback Behavior |
| :--- | :--- | :--- | :--- |
| `VERIFIED_PROFILE` | Exact match against confirmed applicant profile fields | `AUTO_FILL_AND_SUBMIT` | If field is required and missing in profile, transition to `NEEDS_INPUT`. |
| `APPROVED_REUSABLE` | Match against owner-authored, jurisdiction-scoped Answer Bank entry | `AUTO_FILL_AND_SUBMIT` | If no exact approved answer exists, transition to `NEEDS_INPUT` or evaluate grounded LLM if narrative. |
| `GROUNDED_GENERATED` | LLM generation with strict citation requirement against profile + resume + job description | `AUTO_FILL_AND_SUBMIT` (only if confidence >= 0.85 and citations exist) | If confidence < 0.85 or citations missing, transition to `NEEDS_INPUT` with draft answer. |
| `REVIEW_REQUIRED` | Sensitive questions, legal attestations, background check authorization, salary outside bounds | `PAUSE_AND_PROMPT` | Unconditionally pause runner, transition run to `NEEDS_INPUT`. |
| `DECLINE_OPTIONAL` | Optional demographic / EEO surveys (gender, race, veteran, disability) | `AUTO_FILL_AND_SUBMIT` (selects explicit opt-out choice or leaves blank) | If required by form and no decline option exists, transition to `NEEDS_INPUT`. |
| `PROHIBITED_AUTOMATION` | Binding legal signature, SSN/CPF, credit card, payment details, ungrounded fabrication | `PROHIBIT` | Never fill automatically. Transition to `NEEDS_INPUT` or abort run. |

### 5.1 Strict Answering Guardrails & Opt-Out Separation

1. **No Seeded Personal Facts**: The engine does not assume or hardcode candidate citizenship, work authorization, sponsorship needs, compensation, or availability. These must come from validated `VERIFIED_PROFILE` attributes or explicit owner-authored `APPROVED_REUSABLE` bank entries. If an entry is missing, the engine MUST pause in `NEEDS_INPUT`.
2. **Opt-Out vs Substantive Assertions**:
   - `DECLINE_OPTIONAL` applies **strictly to opt-out selections** (e.g. "I choose not to self-identify", "Decline to answer", "I prefer not to say") or leaving optional questions empty.
   - Substantive affirmative/negative assertions (e.g. "I am not a protected veteran", "I have a disability", "No disability") are **`APPROVED_REUSABLE`**, requiring an explicit owner-authored Answer Bank record with timestamp. They must never be selected by `DECLINE_OPTIONAL` or inferred as fallbacks.
3. **Legal Attestations**: Any background check consent, arbitration agreement, or signature confirmation is strictly `REVIEW_REQUIRED` and pauses for explicit owner review.

---

## 6. Grounded LLM Provider Policy & Budgets

When a question qualifies for `GROUNDED_GENERATED`:

1. **Provider Precedence**:
   - Batch 03 defaults to `deterministic-only`. A `GROUNDED_GENERATED` question routes to `NEEDS_INPUT` unless `PROVIDER-PRIVACY-001` has been explicitly accepted and recorded by the owner.
   - After that gate is accepted, primary is `openai:gpt-4o-mini` (temperature: 0.0, max completion tokens: 500, timeout: 15s).
   - After that gate is accepted, secondary fallback is `gemini:gemini-2.5-flash`, triggered only on primary 429/5xx or timeout.
   - Missing credentials, unavailable approved ZDR configuration, provider failure, or an unaccepted privacy gate always routes the question to `NEEDS_INPUT`; it never silently sends data under default retention.
2. **Strict Cost Cap & Resource Limits**:
   - Per-run cost cap: Maximum USD 0.05 per application run (enforced by capping LLM calls at 5 per run and limiting prompt context to 4,000 tokens).
   - Global Batch budget cap: USD 5.00 total across testing.
3. **Provider Data Retention & Privacy Policy**:
   - Model providers may be enabled only after the owner records evidence that the exact API project has provider-approved Zero Data Retention (ZDR). An API key or paid account alone is not evidence of ZDR.
   - BACK-011 must fail closed at startup when a provider is selected without the corresponding owner-attested ZDR configuration; deterministic resolution remains available.
   - Prompts include only the question text, job description excerpt, and sanitized candidate profile facts; raw PDF bytes, passwords, and tokens are never sent to LLM providers.

### 6.1 Named provider gate

- **`PROVIDER-PRIVACY-001` — OPEN:** Owner evidence must identify the provider, API organization/project, ZDR approval, compatible endpoint, and acceptance date. Until the owner records acceptance, Batch 03 is bound to `deterministic-only` and generated narrative questions pause in `NEEDS_INPUT`.
- Configuration is closed: `JOB_ENGINE_ANSWER_PROVIDER=deterministic|openai|gemini` defaults to `deterministic`; a non-deterministic value also requires `JOB_ENGINE_PROVIDER_PRIVACY_ATTESTATION_ID` to match the owner-accepted gate record. Credentials alone never enable a provider.

---

## 7. Reliability, Timeouts, and Per-Platform Retry Limits

| Platform | Max Retries | Retryable Stages (`FAILED_RETRYABLE`) | Non-Retryable Stages (`FAILED_FINAL` / `SUBMISSION_UNKNOWN`) |
| :--- | :--- | :--- | :--- |
| **`greenhouse`** | 2 | Initial page load timeout, transient 5xx on navigation, browser crash prior to form fill. | Platform form validation error (422/400), closed job posting, post-submit response ambiguous (`SUBMISSION_UNKNOWN`). |
| **`lever`** | 2 | Navigation timeout to `/apply`, transient network failure before mutation. | Client-side validation failure, expired posting, post-submit response ambiguous. |
| **Generic Adapter** | 1 | Navigation timeout prior to form interaction. | Missing required field mapping, unmapped custom control, post-submit ambiguity. |

### 7.1 Timeouts and Concurrency
- **Default Runner Concurrency**: `1` (serial execution to avoid anti-bot triggers and window focus conflicts).
- **Maximum Queue Limit**: `25` active/pending runs.
- **Step Timeout**: `30s` per page interaction.
- **Run Timeout**: `300s` (5 minutes) total execution time.
- **Pre-Submit Checkpoint & Idempotency Key**:
  - `sha256(canonical_application_url + ":" + resume_sha256 + ":" + profile_version)`
  - Checkpoint `SUBMIT_ARMED` must be committed and verified before activating the platform submit button.
  - Strict 1-click rule: Submit is activated once. If confirmation is not detected within timeout, mark as `SUBMISSION_UNKNOWN` and capture screenshot without clicking again.

---

## 8. Bound technical values

The following values are mechanically bound for all Batch 03 Work Orders:

| Parameter | Bound Value | Notes |
| :--- | :--- | :--- |
| **RUNNER_PACKAGE** | `playwright` | Standard Node.js Playwright runtime |
| **RUNNER_VERSION** | `1.62.1` | Pinned to match workspace `@playwright/test` |
| **BROWSER_CHANNEL** | `chromium` | Dedicated Playwright Chromium distribution |
| **PROFILE_DIRECTORY_CONFIG**| `JOB_ENGINE_AUTOMATION_PROFILE_DIR` | Defaults to `~/.job-engine/browser-profile` |
| **PRIMARY_ATS_ONE_ID** | `greenhouse` | Bound to CROSS-007 (`/apps/automation/src/adapters/greenhouse.ts`) |
| **PRIMARY_ATS_TWO_ID** | `lever` | Bound to CROSS-008 (`/apps/automation/src/adapters/lever.ts`) |
| **Backend-to-Runner Transport** | Local HTTP REST + SSE | `Authorization: Bearer JOB_ENGINE_RUNNER_SECRET` on loopback (127.0.0.1) |
| **Default Concurrency** | `1` | Serial execution to prevent rate limits and focus contention |
| **Maximum Queue Limit** | `25` | Bounded queue depth |
| **Step Timeout** | `30s` | Maximum duration for any individual page interaction |
| **Run Timeout** | `300s` (5 minutes) | Maximum total execution duration per application run |
| **Answer Provider Default** | `deterministic-only` | External generation disabled while `PROVIDER-PRIVACY-001` is open |
| **Per-Run Cost Cap** | USD 0.05 | Max 5 LLM calls per run |
| **Idempotency Key** | `sha256(...)` | `sha256(canonical_application_url + ":" + resume_sha256 + ":" + profile_version)` |
| **Evidence Retention** | 30 days | Stored in `~/.job-engine/evidence/runs/{run_id}/` (git-ignored) |

---

## 9. Acceptance decision definitions

Batch 03 acceptance (CROSS-009) evaluates the integrated system against three outcomes:

- **`GO`**: Full synthetic test matrix passes completely. Owner-authorized live submissions on Greenhouse and Lever succeed without error. Redacted receipt evidence and audit records are generated. Zero credential leakage or path escapes. If either live submission is not authorized, the maximum result is `CONDITIONAL_GO`.
- **`CONDITIONAL_GO`**: Minor non-blocking UI styling or non-critical formatting issues identified with an owner-approved fast-follow remediation plan. All security invariants remain intact.
- **`NO_GO`**: Any duplicate submission, path traversal escape, ungrounded answer submitted without review, CAPTCHA bypass attempt, or credential leakage into git/logs.
