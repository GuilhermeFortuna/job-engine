# CROSS-009 — Scenario Transcript Matrix

Supporting evidence for `docs/evidence/embedded-assisted-apply-acceptance.md`.
Commit `e43381015b888a56dad1cc9263bfa22d07ced2e8`, 2026-08-19.

All results below are **synthetic**. No live ATS target was loaded, mutated, or submitted.

---

## 1. Real-Electron fixture drivers

Command:

```bash
JOB_ENGINE_RUNNER_SECRET=<synthetic> \
  corepack pnpm --filter @job-engine/desktop run test:fixtures
```

Result: **6 files / 6 tests passed**, 17.2s of test time.

```
✓ generic-runtime.test.ts       drives synthetic HTTPS forms through the real isolated world     1338ms
✓ greenhouse-runtime.test.ts    drives synthetic Greenhouse HTTPS forms through the isolated world 1601ms
✓ lever-runtime.test.ts         drives synthetic Lever HTTPS apply forms through the isolated world 1838ms
✓ generic-real-backend.test.ts  completes the full lifecycle through to a confirmed receipt       3012ms
✓ lever-lifecycle.test.ts       completes fill, upload, review, release, reclaim, one confirmed submit 3393ms
✓ synthetic-fixtures.test.ts    executes the embedded browser lifecycle in a real Electron shell  4822ms
```

Each vitest test is a driver that spawns a **real Electron binary** and reports many
internal cases. The case names below were extracted from the driver sources and are the
actual assertion set.

---

## 2. Scenario A — desktop isolation and lifecycle

Driver: `tests/fixtures/electron-test-runner.ts` (real Electron, real HTTPS origins).

| # | Case | Result |
| --- | --- | --- |
| A1 | Trusted renderer confinement | PASS |
| A2 | API run resolution and visible `WebContentsView` | PASS |
| A3 | Bounds and layout adjustments | PASS |
| A4 | Dedicated cookie session persistence across navigation | PASS |
| A5 | Reopen and session partition survival | PASS |
| A6 | Popups denied fail-closed | PASS |
| A7 | Downloads denied fail-closed | PASS |
| A8 | Hostile script isolation | PASS |

Remote `WebContentsView` `webPreferences`: `nodeIntegration: false`,
`contextIsolation: true`, `sandbox: true`, `webSecurity: true`,
`allowRunningInsecureContent: false`, **no preload**.

Supporting unit coverage (`pnpm run test`, desktop project):

*Navigation policy (8/8)* — preserves origin/pathname while stripping query and hash;
empty string for invalid or non-HTTP schemes; allows valid public HTTPS; denies non-HTTPS
remote in production mode; allows loopback HTTP in test mode; **denies remote HTTP even in
test mode**; denies dangerous and local schemes; denies empty or unparseable URLs.

*IPC sender validation (3/3)* — authorizes only the exact trusted origin; rejects
different origins or ports; rejects missing `senderFrame` or invalid URLs.

*Bounds validation and clipping (5/5)* — accepts valid bounds; clamps negative
coordinates; clamps oversized dimensions; handles non-finite/NaN; handles out-of-window
coordinates.

*Isolated world (23/23)* — delivers the compiled page script verbatim; **never
interpolates arguments into script source**; uses the unique context id; falls back to the
numeric context id; **creates the world without universal access**; reuses one world across
calls; rebuilds after navigation; surfaces page-script exceptions as errors. Hostile
argument transport passes single quote, double quote, backtick, backslash, newline,
carriage return, U+2028, U+2029, `</script>`, escaped script close, template expression,
command-shaped page text, null-ish text, and unicode **through by value**, and **cannot be
redirected to another operation by page content**. Lifecycle: attaches once and detaches
only what it attached; leaves a pre-attached debugger attached; refuses calls after
disposal; disposes cleanly even when detach throws.

---

## 3. Scenario B — generic assisted flow

### B.1 Isolated-world runtime — `generic-runtime-runner.ts` (13/13 PASS)

1. observes a real page through a CDP isolated world
2. fills and verifies against page-visible state
3. discovers conditional fields only after a change
4. pauses on an auth wall
5. pauses on a CAPTCHA
6. pauses on an unsupported required control
7. pauses on reported validation errors
8. **stops at review rather than submitting**
9. uploads the granted resume and deletes the temp file
10. fails closed when the page rejects the upload
11. **a hostile page cannot turn its text into commands**
12. hands back a run in an unsupported automation mode
13. never posts evidence outside receipt and log

### B.2 Real backend lifecycle — `real-backend-runner.ts` (9/9 PASS)

Against the **real FastAPI service and real PostgreSQL**.

1. claims the owner-selected run from the real backend
2. fetches and verifies the granted resume
3. obtains decisions from the real answer policy
4. runs steps until the application is ready for review
5. arms the submit and pauses for the owner
6. **refuses to submit before the owner releases**
7. detects the owner release and reclaims at `submit_armed`
8. **submits once and reconciles a confirmed receipt**
9. **never submits a second time**

---

## 4. Scenario C — platform adapters

### C.1 Greenhouse — `greenhouse-runtime-runner.ts` (15/15 PASS)

1. observes Greenhouse standard fields through CDP isolated world
2. fills and verifies against Greenhouse page DOM
3. discovers conditional fields only after change
4. **pauses on legal attestation and keeps field unresolved**
5. pauses on validation errors
6. pauses on CAPTCHA challenge
7. pauses on auth wall
8. pauses on unsupported control (canvas signature)
9. uploads granted resume and cleans up temp files
10. fails closed when page rejects resume upload
11. stops at review step rather than submitting
12. submits once after simulated release and reconciles confirmed receipt
13. **handles ambiguous post-submit without receipt and without second submit**
14. resists non-semantic DOM drift
15. isolates hostile page text from execution and evidence

### C.2 Lever runtime — `lever-runtime-runner.ts` (18/18 PASS)

1. detects a synthetic Lever apply form
2. **does not detect or advance a posting page**
3. **rejects Greenhouse-shaped collision markup on a Lever URL**
4. fills and verifies visible Lever values
5. discovers conditional fields only after a change
6. pauses on unresolved required fields
7. uploads the granted resume and deletes temp files
8. fails closed when the page rejects the upload
9. pauses on client validation alerts
10. pauses on an hCaptcha challenge
11. pauses on a required university combobox
12. **does not pause solely for an optional location combobox**
13. stops at review rather than submitting
14. submits once and captures a confirmed receipt
15. **ambiguous submit returns null and is not activated again**
16. **thanks path with a remaining form is ambiguous**
17. resists non-semantic DOM drift
18. isolates hostile page text

### C.3 Lever real-backend lifecycle — `lever-lifecycle-runner.ts` (12/12 PASS)

1. claims the owner-selected Lever run
2. fetches and verifies the granted resume
3. detects the synthetic `/apply` form
4. observes an unresolved required custom field
5. fills authorized visible values
6. uploads resume and reaches `READY_FOR_REVIEW`
7. arms `submit_armed` and pauses for the owner
8. **refuses to submit before the owner releases**
9. detects owner release and reclaims the same run
10. **submits once and reconciles a confirmed receipt**
11. **never submits a second time**
12. **ambiguous receipt is null and is not activated again**

### C.4 Live non-submitting visual inspection — **NOT PERFORMED**

`LEGAL-GATE-ATS-001` is OPEN and no owner authorization naming a live inspection target
was supplied. The CROSS-009 entry gate requires a named target. No live ATS page was
loaded.

---

## 5. Scenario D — state, safety, presentation

### D.1 Web workspace E2E — 10/10 PASS

```bash
apps/web/node_modules/.bin/playwright test embedded-application-workspace.spec.ts
```

```
✓  1 ordinary browser keeps the external apply link and does not embed        328ms
✓  2 desktop launch confirms a semi-auto run and opens the workspace          1.3s
✓  3 review resolution, prepared submit, and confirmed receipt                1.1s
✓  4 auth pause resumes without collecting credentials                        663ms
✓  5 submission unknown shows allowlisted evidence metadata only              463ms
✓  6 cancel marks the run cancelled                                           626ms
✓  7 duplicate conflict shows the existing run and explicit override          1.6s
✓  8 undersized window closes the native view and supported size reopens      826ms
✓  9 leaving the workspace closes the native view                             702ms
✓ 10 workspace axe scan reports 0 serious or critical violations              640ms
```

> **Harness caution (defect D-5).** The first execution of this spec failed 8/8 because
> `reuseExistingServer: !process.env.CI` reused a stale `next start` on `:3005` serving a
> pre-build bundle. Killing the listeners on `:3005` and `:8088` produced the clean 10/10
> above. Always verify those ports are free before an acceptance run.

### D.2 Redaction (10/10 PASS)

`safeText` strips control characters and collapses whitespace; bounds length.
`enforceRedaction` replaces values under sensitive keys at any depth; matches sensitive
keys regardless of casing or wrapping; keeps payload shape so the audit trail stays
readable; stops runaway nesting. `buildFieldReport` **carries identity and state but never
a value**; projects the exact snake_case backend exception contract. `safeUrl` drops query
strings and fragments; returns empty for an unparseable URL.

`EvidenceRecorder` restricts evidence to `receipt` and `log` only. Screenshots and DOM
snapshots are deliberately out of scope per the documented CROSS-010 rationale.

### D.3 Checkpoints and one-shot submit (12/12 PASS)

Checkpoint ordering records forward progress; **never records a regression or a repeat**;
rejects values outside the backend enum. Submit-attempt detection treats a recorded
attempt timestamp as attempted; treats the `submitting` checkpoint as attempted even
without a timestamp; treats a fresh run as not attempted. Release detection **requires
queued status and the armed checkpoint together**.

Source-verified guards (`apps/desktop/src/main/runtime/checkpoints.ts`):

```ts
isReleasedForSubmit(run) =
     run.automationMode === "semi_auto_pause_before_submit"
  && run.status === "queued"
  && run.currentCheckpoint === "submit_armed"

resumePhaseFor(run) =
     submitAlreadyAttempted(run) ? "reconcile_submit"
   : isReleasedForSubmit(run)    ? "submit"
   : "fill"
```

Backend `ApplicationRunRepository.release_submit()` independently enforces
mode = `SEMI_AUTO_PAUSE_BEFORE_SUBMIT`, checkpoint = `submit_armed`, status =
`needs_input`, then writes a `SUBMIT_RELEASED` audit event carrying the owner
confirmation.

### D.4 `FULL_AUTO` unavailability

| Layer | Evidence |
| --- | --- |
| Web UI | `api.ts:297-299` posts `job_group_ids: [input.jobGroupId]` and `automation_mode: SEMI_AUTO_MODE` — one job, semi-auto, always explicit |
| Web UI | `ApplicationLauncher.test.tsx:122` asserts the dialog never renders `FULL_AUTO` |
| Desktop | `lease.ts:35,96-101` — `SUPPORTED_AUTOMATION_MODE = "semi_auto_pause_before_submit"`; anything else yields `unsupported_automation_mode` |
| Desktop runtime | generic driver case 12: "hands back a run in an unsupported automation mode" |
| Constants | web `SEMI_AUTO_MODE` === api `AutomationMode.SEMI_AUTO_PAUSE_BEFORE_SUBMIT` === `"semi_auto_pause_before_submit"` |

Advisory A-1: `ApplicationRunCreateRequest.automation_mode` **defaults** to `FULL_AUTO`
(`schemas.py:650`) and `job_group_ids` accepts up to 25 entries. Unreachable from Batch 03
desktop/UI paths, but recommended to BACK-010 as a defense-in-depth hardening.

### D.5 API auth surface separation

Runner-facing endpoints in `apps/api/src/job_engine/api/applications.py` carry
`dependencies=[Depends(verify_runner_secret)]` and a lease token (lines 610, 636, 664,
705, 741, 775, 804). Owner/UI endpoints — including `release-submit` (line 511) — sit on
the unauthenticated loopback surface, matching `docs/automation/security-model.md`
threat rows T02/T03.

---

## 6. Repository hygiene

```
$ git ls-files docs/resume
docs/resume/README.md
docs/resume/resume.template.md
docs/resume/resume_1page.template.html
→ no personal resume artifact tracked

$ git diff --check
→ clean

$ git status --porcelain
→ clean
```

Secret-pattern scan across all tracked files (`sk-*`, `AIza*`, PEM private keys,
`Bearer <token>`) returned exactly two hits, both clearly synthetic:

- `apps/api/tests/api/test_runner_claim_release.py:253` — `"Bearer not-the-runner-secret"`,
  a negative-path test literal.
- `apps/desktop/tests/fixtures/certs.ts:1` — self-signed TLS key for loopback HTTPS
  fixture servers (advisory A-2).

Path isolation:

- Desktop user-data default: `~/.job-engine/desktop-data` — outside the repository.
- Session partition: `persist:job-engine-ats` — dedicated, never a normal browser profile.
- Fixture Electron user-data: `apps/desktop/dist/.test-userData`, covered by the ignored
  `dist/` rule.
- `apps/web/test-results` ignored via `.gitignore:29`.
- `config.ts` throws unless `JOB_ENGINE_API_BASE_URL` is a loopback origin.
- PostgreSQL published on `127.0.0.1:5432` only.

---

## 7. Full-suite transcripts

```
corepack pnpm run test
  apps/api      318 passed, 3 skipped   (29.15s)
  apps/desktop  282 passed / 20 files   (unit + runtime + forms)
  apps/web      137 passed / 32 files
```

```
corepack pnpm run build          # with JOB_ENGINE_RUNNER_SECRET set
  apps/api      Done
  apps/desktop  Done
  apps/web      Compiled successfully; routes /, /jobs, /jobs/[jobGroupId],
                /applications/[runId]/workspace
```

```
apps/web playwright test         # full suite, clean servers
  25 passed, 1 failed
  ✗ live-search.spec.ts:111  Automated Axe accessibility audit on Live Search dialog
    color-contrast, impact=serious, fg #009966 on bg #ffffff, 3.65:1 < 4.5:1
    → defect D-3, LiveSyncProgressModal.tsx:127 (Batch 02 surface)
```

```
corepack pnpm run check
  apps/api      All checks passed (ruff, format, mypy 86 files)
  apps/desktop  Done (tsc + tsc -p tsconfig.test.json)
  apps/web      FAILED — react-hooks/set-state-in-effect
                catalog-backdrop.tsx:22  → defect D-1
```
