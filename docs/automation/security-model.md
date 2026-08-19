# Embedded Assisted Apply Security and Threat Model

**Initial work order:** [CROSS-005](../work-orders/cross-repo/CROSS-005-high-automation-feasibility-spec.md)

**Current scope:** [V2 Embedded Assisted Apply Specification](../v2-assisted-apply-spec.md), owner-revised 2026-08-18

**Status:** Accepted Batch 03 security authority

---

## 1. Executive summary

Job Engine displays an owner-selected third-party application page inside a local Electron desktop application and assists with form completion. The page is untrusted internet content running beside a privileged local application that can access applicant data and a run-scoped resume. The design therefore separates the trusted Next.js renderer, privileged Electron main process, sandboxed remote `WebContentsView`, and FastAPI/PostgreSQL system of record.

The product exposes only visible `SEMI_AUTO_PAUSE_BEFORE_SUBMIT` runs. Final submission requires an explicit action in the trusted Job Engine UI, a backend `release-submit` transition, same-run reclaim at `SUBMIT_ARMED`, and one reconciled remote submit activation. `FULL_AUTO` remains a backend compatibility value and is not authorized in Batch 03 desktop/UI paths.

---

## 2. Trust boundaries

```text
+--------------------------------------------------------------------------------+
| TRUSTED LOCAL APPLICATION                                                      |
|                                                                                |
|  Next.js renderer                 Electron 43.2.0 main process                 |
|  - workspace presentation         - validates trusted IPC sender               |
|  - browser bounds only            - owns WebContentsView and session            |
|  - review/release UI              - keeps runner/lease/grant secrets            |
|               | typed closed IPC  - observes/fills through adapters             |
|               +-----------------> - applies navigation/permission policy        |
|                                                                                |
|  FastAPI + PostgreSQL                                                        |
|  - profile, answers, resume grants                                             |
|  - run/lease/checkpoint/exception/audit truth                                  |
|  - grounded decisions and receipt reconciliation                              |
+---------------------------------------|----------------------------------------+
                                        | sandboxed outbound HTTPS
+---------------------------------------v----------------------------------------+
| UNTRUSTED REMOTE WEB                                                           |
| Sandboxed WebContentsView                                                      |
| - no Node integration or preload                                               |
| - no Electron/raw IPC/backend/filesystem access                                |
| - hostile HTML, scripts, questions, redirects, frames and popups assumed       |
+--------------------------------------------------------------------------------+
```

The trusted renderer loads only the exact configured loopback web origin. The remote view is not a React DOM child and receives no preload bridge.

---

## 3. End-to-end data flow

```mermaid
sequenceDiagram
    autonumber
    actor Owner
    participant UI as Trusted Next.js workspace
    participant Desktop as Electron main/runtime
    participant API as FastAPI/PostgreSQL
    participant ATS as Sandboxed remote ATS view

    Owner->>UI: Select job and resume
    UI->>API: POST application-runs (one job, SEMI_AUTO)
    API-->>UI: run_id
    UI->>Desktop: openApplication(run_id)
    Desktop->>API: GET application run; resolve URL
    Desktop->>ATS: Navigate to validated HTTPS URL
    Desktop->>API: Claim existing run lease
    Desktop->>ATS: Observe normalized fields
    Desktop->>API: Request answer decisions
    API-->>Desktop: Decisions + provenance/confidence
    Desktop->>ATS: Fill and verify authorized values
    Desktop->>API: Fetch single-use resume grant
    Desktop->>ATS: Upload selected PDF and verify

    alt Missing, sensitive, auth, CAPTCHA or unsupported
        Desktop->>API: Record named exception
        API-->>UI: SSE exception state
        Owner->>UI: Resolve answer or complete page challenge
        UI->>API: Resolve/resume same run
    end

    Desktop->>API: Checkpoint SUBMIT_ARMED + SEMI_AUTO_ARMED
    API-->>UI: Prepared review state
    Owner->>UI: Activate Submit application
    UI->>API: POST release-submit
    Desktop->>API: Reclaim same run at SUBMIT_ARMED
    Desktop->>ATS: Activate final submit once
    Desktop->>API: Record receipt or SUBMISSION_UNKNOWN
    API-->>UI: Truthful terminal state via SSE
```

---

## 4. Threat matrix

| ID | Threat | Required mitigation |
| --- | --- | --- |
| T01 | Resume path traversal/symlink escape | BACK-009 canonicalizes beneath the configured resume root; desktop receives bytes only through a single-use run grant, verifies checksum, materializes only a restrictive per-run OS-temporary file for CDP upload, and deletes it on success/failure/shutdown. |
| T02 | Runner-token replay or untrusted local process | Loopback-only API, bearer runner secret, short lease, heartbeat, run-scoped lease/grant, no token in renderer/IPC/logs. |
| T03 | Remote page attacks loopback API | Remote view receives no API credentials; strict API CORS/origin policy remains; privileged calls occur only in Electron main. |
| T04 | Remote content reaches Node/Electron | `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, no remote preload, no raw IPC. |
| T05 | Forged trusted IPC | Exact sender-frame origin validation, closed channel list, runtime payload validation, no arbitrary URL/JS/path/header arguments. |
| T06 | Navigation/origin escape | Initial URL resolved by run ID; `URL` parser plus adapter host/path rules; deny unapproved redirect/frame/popup/download/protocol. |
| T07 | Permission abuse | Deny all remote permission requests by default; adapters cannot silently broaden the policy. |
| T08 | Prompt injection in job/page text | Treat all remote/job text as data; BACK-011 accepts only allowlisted evidence and returns closed decisions/provenance. |
| T09 | Credential/sensitive leakage | No credentials in Job Engine controls; redact evidence before persistence; exclude hidden/password/token/cookie/raw answer values. |
| T10 | Normal browser profile collision | Dedicated Electron session/user-data directory outside Git; never attach/copy Chrome/Chromium profiles; exclusive desktop ownership. |
| T11 | Duplicate submission | BACK-010 idempotency, `SUBMIT_ARMED`, explicit release, same-run reclaim, one remote activation, explicit duplicate override only. |
| T12 | Ambiguous post-submit state | Never retry submit; capture bounded evidence and record `SUBMISSION_UNKNOWN`. |
| T13 | Unauthorized legal commitment | BACK-011 routes legal/signature/sensitive intents to review/prohibition; trusted UI requires explicit resolution and final release. |
| T14 | Browser-view overlay spoofing | React reports bounded rectangle; main clips to content bounds; close/hide on route change, blur-sensitive dialogs, unsupported size, or untrusted state. |
| T15 | Orphaned remote renderer/session | Explicitly dispose child `webContents`; handle crash/close/restart; checkpoint before mutation and recover only safe stages. |
| T16 | Unauthorized full-auto/background execution | UI always creates one semi-auto run; desktop rejects claimed `FULL_AUTO`; tests prove no full-auto or multi-job launch surface. |

---

## 5. Security invariants

1. Only an explicitly selected job and resume can create an application workspace.
2. The application URL comes from the backend run, never from renderer IPC.
3. The remote page has no Node, Electron, preload, raw IPC, runner-token, API-token, or arbitrary filesystem capability.
4. The desktop runtime accepts only `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`.
5. Personal resume bytes are obtained through one single-use grant, checksum-verified, materialized only in a per-run OS-temporary directory for CDP `DOM.setFileInputFiles`, deleted immediately after verification and on every cleanup path, and never committed.
6. Every browser mutation is based on a backend decision or fixed adapter/navigation behavior; page text cannot issue commands.
7. Unknown, sensitive, low-confidence, auth, CAPTCHA, validation, and unsupported states pause visibly.
8. Final submission requires `SUBMIT_ARMED` and an explicit trusted-UI `release-submit` action.
9. The final remote control is activated once; ambiguity never becomes success or an automatic retry.
10. `SUBMITTED` requires backend-reconciled receipt evidence.
11. Evidence is bounded, redacted, stored outside Git, and subject to the configured retention policy.
12. Live inspection or submission occurs only against an exact owner-authorized target and within the platform-register gate.

---

## 6. Required security verification

- Hostile remote fixture attempts Node/Electron/preload/IPC/backend/filesystem access.
- Forged IPC sender and malformed bounds/run-ID payloads.
- HTTP, lookalike host, redirect, frame, popup, download, permission, and external-protocol attempts.
- Normal-profile path/configuration rejection and dedicated-session restart persistence.
- Prompt injection, hidden sensitive fields, token/cookie/log redaction, and resume-byte searches.
- Renderer crash, desktop restart, stale lease, checkpoint replay, duplicate run, double release, double click, and ambiguous receipt.
- Browser overlay bounds during resize, scroll, route change, dialog, minimum viewport, and close.
- Claimed `FULL_AUTO` run rejection and absence of a UI/IPC path that creates one.

Any failure that exposes privilege, secrets, personal files, duplicate submission, unauthorized navigation, or silent final submission is `NO_GO` for CROSS-009.
