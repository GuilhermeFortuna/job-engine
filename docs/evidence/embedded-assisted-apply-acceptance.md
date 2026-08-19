# CROSS-009 — Embedded Assisted Apply Acceptance Report

**Decision: `CONDITIONAL_GO`**

**Date:** 2026-08-19
**Commit under test:** `e43381015b888a56dad1cc9263bfa22d07ced2e8` (`development`)
**Reviewer:** CROSS-009 acceptance agent (independent of Batch 03 implementation orders)
**Scope authority:** `docs/v2-assisted-apply-spec.md`, `docs/automation/security-model.md`, `docs/automation/platform-register.md`

---

## 1. Decision summary

Batch 03 **functional acceptance is established on synthetic evidence**. The embedded
assisted-apply workspace is isolated, visible, owner-gated, one-shot on submit, and
recoverable. Every safety-critical acceptance criterion passed against real Electron,
real HTTPS fixture servers, and — for the generic and Lever families — the real backend.

The decision is `CONDITIONAL_GO` rather than `GO` for reasons that are **entirely
external to Batch 03 implementation quality**:

1. **`LEGAL-GATE-ATS-001` is OPEN.** No live ATS mutation or submission is authorized.
2. **`PROVIDER-PRIVACY-001` is OPEN.** Generated narrative answers are conditional; only
   deterministic decisions were exercised.
3. **No owner authorization naming a live inspection target was supplied.** Acceptance
   scenario C.4 (owner-authorized live non-submitting visual inspection for Greenhouse
   and Lever) was therefore **not performed**. This is a deliberate omission under the
   entry gate, not a test failure.
4. **Two repository-validation commands do not pass as written** (§6). Neither defect is
   in Batch 03 assisted-apply code; both are reported to their owning orders in §7.

Production platform readiness remains conditional. Fixture-only results are **not**
promoted to production ATS support.

---

## 2. Environment record

| Component | Version |
| --- | --- |
| OS | Linux 7.1.8-200.fc44.x86_64 (Fedora) |
| Node.js | 24.18.0 |
| pnpm | 10.34.5 (via corepack) |
| CPython (api venv) | 3.13.14 |
| uv | 0.11.32 |
| Electron | 43.2.0 |
| Chromium | bundled with Electron 43.2.0 |
| Playwright | 1.62.1 |
| PostgreSQL | postgres:17.11 (container `job-engine-postgres-1`) |
| Docker | 29.7.2 |

**Isolation posture verified:**

- PostgreSQL published on `127.0.0.1:5432` only — loopback-bound, not `0.0.0.0`.
- `apps/desktop/src/main/config.ts` rejects any non-loopback `JOB_ENGINE_API_BASE_URL`.
- Desktop user-data defaults to `~/.job-engine/desktop-data` — **outside the repository**.
- Session partition is the dedicated `persist:job-engine-ats`; no normal browser profile
  is referenced anywhere in desktop sources.
- Fixture Electron user-data resolves to `apps/desktop/dist/.test-userData`, covered by
  the ignored `dist/` rule; no cookie/profile material can reach a commit.
- `git ls-files docs/resume` returns only `README.md`, `resume.template.md`,
  `resume_1page.template.html` — no personal resume artifact is tracked.
- `git diff --check` clean; working tree clean after the run.

---

## 3. Automated validation transcript

| Command | Result |
| --- | --- |
| `corepack pnpm install --frozen-lockfile` | **PASS** — lockfile up to date |
| `docker compose up -d postgres` | **PASS** — healthy, loopback-only |
| `cd apps/api && uv run alembic upgrade head` | **PASS** — at head, no pending revisions |
| `corepack pnpm run check` | **FAIL** — 1 ESLint error, `apps/web` (defect D-1, §7) |
| `corepack pnpm run test` | **PASS** — api 318 passed / 3 skipped; desktop 282 passed; web 137 passed |
| `corepack pnpm run build` | **FAIL as written** → **PASS** with runner secret (defect D-2, §7) |
| `corepack pnpm --filter @job-engine/desktop run test:fixtures` | **PASS** — 6/6 real-Electron fixture drivers |
| `corepack pnpm --filter @job-engine/web run test:e2e -- embedded-application-workspace.spec.ts` | **PASS** (10/10) — the `--` filter is inert, see defect D-4 |
| `git ls-files docs/resume \| rg -v '…'` | **PASS** — no personal artifacts tracked |
| `git diff --check` | **PASS** |

Full Playwright suite on clean servers: **25 passed, 1 failed** (defect D-3, §7 — a
Batch 02 Live Search contrast regression, outside the Batch 03 workspace).

Workspace spec in isolation on clean servers: **10 passed / 10**, including
`workspace axe scan reports 0 serious or critical violations`.

---

## 4. Scenario matrix

### A. Desktop isolation and lifecycle — **PASS**

Driver: `apps/desktop/tests/fixtures/synthetic-fixtures.test.ts` →
`electron-test-runner.ts`, executed in a **real Electron binary** against real
HTTPS fixture origins.

| # | Check | Result |
| --- | --- | --- |
| A1 | Trusted renderer confinement to the configured loopback origin | PASS |
| A2 | API-resolved run opens a visible `WebContentsView` | PASS |
| A3 | Bounds and layout adjustments | PASS |
| A4 | Dedicated cookie session persists across navigation | PASS |
| A5 | Reopen and session-partition survival | PASS |
| A6 | Popups denied, fail-closed | PASS |
| A7 | Downloads denied, fail-closed | PASS |
| A8 | Hostile script isolation | PASS |

Remote view is constructed with `nodeIntegration: false`, `contextIsolation: true`,
`sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, and **no
preload**. Supporting unit coverage: 8 navigation-policy cases (non-HTTPS remote denied,
`file:`/dangerous schemes denied, remote HTTP denied even in test mode, unparseable
denied), 3 IPC sender-validation cases (exact trusted origin only; different origin or
port rejected; missing/invalid `senderFrame` rejected), 5 bounds-clipping cases
(negative, oversized, NaN/non-finite, out-of-window all clamped).

**Scope note:** renderer-crash and full Electron-restart recovery are covered
*structurally* by checkpoint-resume logic and the reopen/partition-survival case rather
than by an induced renderer crash. See gap G-1 (§8).

### B. Generic assisted flow — **PASS**

Drivers: `generic-runtime.test.ts` → `generic-runtime-runner.ts` (real Electron + CDP
isolated world + mock runner API), and `generic-real-backend.test.ts` →
`real-backend-runner.ts` (**real FastAPI backend + real PostgreSQL**).

Isolated-world runtime (13/13): observes a real page through a CDP isolated world; fills
and verifies against page-visible state; discovers conditional fields only after a
change; pauses on auth wall, CAPTCHA, unsupported required control, and reported
validation errors; **stops at review rather than submitting**; uploads the granted resume
and deletes the temp file; fails closed when the page rejects the upload; a hostile page
cannot turn its text into commands; hands back a run in an unsupported automation mode;
never posts evidence outside receipt and log.

Real-backend lifecycle (9/9): claims the owner-selected run; fetches and verifies the
granted resume; obtains decisions from the real answer policy; runs steps to
ready-for-review; arms submit and pauses for the owner; **refuses to submit before the
owner releases**; detects the owner release and reclaims at `submit_armed`; **submits
once** and reconciles a confirmed receipt; **never submits a second time**.

### C. Platform adapters — **PASS (synthetic); C.4 NOT PERFORMED**

**Greenhouse** (`greenhouse-runtime-runner.ts`, 15/15): standard-field observation via
CDP isolated world; fill/verify against page DOM; conditional fields only after change;
pauses on legal attestation keeping the field unresolved; pauses on validation errors,
CAPTCHA, auth wall, and an unsupported canvas-signature control; uploads granted resume
and cleans temp files; fails closed on upload rejection; stops at review; submits once
after release and reconciles a confirmed receipt; **handles ambiguous post-submit without
receipt and without a second submit**; resists non-semantic DOM drift; isolates hostile
page text from execution and evidence.

**Lever** (`lever-runtime-runner.ts`, 18/18 + `lever-lifecycle-runner.ts`, 12/12 against
the **real backend**): detects a synthetic Lever apply form; does **not** detect or
advance a posting page; **rejects Greenhouse-shaped collision markup on a Lever URL**;
fill/verify; conditional discovery; pauses on unresolved required fields, client
validation alerts, hCaptcha, and a required university combobox; does **not** pause for an
optional location combobox; upload + temp-file deletion; fail-closed upload rejection;
stops at review; submits once with confirmed receipt; **ambiguous submit returns null and
is not activated again**; a thanks path with a remaining form is treated as ambiguous;
resists DOM drift; isolates hostile page text. Full lifecycle adds claim, resume fetch and
verification, unresolved required custom field, owner arm/pause, refusal before release,
release detection with same-run reclaim, one confirmed submit, no second submit, and
ambiguous-receipt handling.

**C.4 — owner-authorized live non-submitting visual inspection: NOT PERFORMED.** No owner
authorization naming a live target was supplied, and `LEGAL-GATE-ATS-001` is OPEN. The
entry gate forbids proceeding without a named target. This is the primary reason the
decision is `CONDITIONAL_GO`.

### D. State, safety, and presentation — **PASS**

| Criterion | Evidence | Result |
| --- | --- | --- |
| D1 exception paths | auth, CAPTCHA, validation, unsupported control, unresolved required, upload rejection, DOM drift covered per adapter above; runner-disconnect and lease loss covered by `lease.test.ts`; resume/restart by `checkpoints.test.ts` (12 cases) | PASS |
| D2 duplicate rejection + explicit override | web e2e `duplicate conflict shows the existing run and explicit override`; api `test_applications.py`, `test_application_claim_release.py` | PASS |
| D3 `FULL_AUTO` unavailable | Web UI posts `automation_mode: SEMI_AUTO_MODE` with `job_group_ids: [input.jobGroupId]` — exactly one job, never full-auto (`apps/web/src/features/applications/api.ts:297-299`). Desktop `lease.ts:96` rejects any mode ≠ `semi_auto_pause_before_submit` with `unsupported_automation_mode`. Runtime driver asserts a full-auto run is handed back unexecuted. `ApplicationLauncher.test.tsx` asserts the dialog never renders the string `FULL_AUTO`. **No desktop/UI path creates or executes `FULL_AUTO` or a background multi-job queue.** | PASS |
| D4 secret / PII scan | Tracked-file scan for `sk-*`, `AIza*`, PEM private keys, and bearer tokens returned only two clearly synthetic test artifacts (§7, A-2/A-3). `EvidenceRecorder` restricts evidence to `receipt` and `log`; every entry passes `enforceRedaction`; `safeUrl` strips query and fragment; `buildFieldReport` "carries identity and state but never a value" (10 redaction cases pass). Screenshots and DOM snapshots are deliberately out of scope. | PASS |
| D5 accessibility / bounds / external-link fallback | Workspace axe scan: **0 serious or critical**. `MIN_WORKSPACE_WIDTH=1280` / `MIN_WORKSPACE_HEIGHT=720` enforced; e2e `undersized window closes the native view and supported size reopens` and `leaving the workspace closes the native view` pass. Live announcements via `role="status" aria-live="polite"` in `BrowserToolbar`, `ApplicationStatusBar`, `ApplicationWorkspace`. e2e `ordinary browser keeps the external apply link and does not embed` passes. | PASS |

---

## 5. Acceptance criteria verdict

| # | Criterion | Verdict |
| --- | --- | --- |
| 1 | Trusted UI and untrusted page isolated under hostile fixture testing | **MET** |
| 2 | Generic, Greenhouse, Lever fixtures complete visibly through review and owner-released confirmed submission | **MET** (synthetic) |
| 3 | No Batch 03 desktop/UI path creates or executes `FULL_AUTO` or a background multi-job queue | **MET** (see advisory A-1) |
| 4 | Every final submit requires explicit trusted-UI release and activates the remote control at most once | **MET** |
| 5 | Exceptions retain the same run/session and never invent, omit, or submit unresolved required values | **MET** |
| 6 | Restart recovery does not replay verified steps; duplicates and ambiguous outcomes not blindly retried | **MET** |
| 7 | `SUBMITTED` only with backend-reconciled receipt; unknown remains visibly non-success | **MET** |
| 8 | No secret, cookie, personal fixture, resume byte/path, token, or unredacted sensitive answer in committed evidence or logs | **MET** (advisories A-2, A-3) |
| 9 | Automated checks and manual desktop, accessibility, bounds, and authorized live-inspection evidence independently recorded | **PARTIAL** — live-inspection evidence absent because no authorization was issued |

**Criterion 4 — mechanism verified in source, not only by test name:**
`isReleasedForSubmit()` requires all three of `automationMode === "semi_auto_pause_before_submit"`,
`status === "queued"`, and `currentCheckpoint === "submit_armed"`.
`resumePhaseFor()` short-circuits to `reconcile_submit` whenever `submitAlreadyAttempted()`
is true, so a reclaimed run that already attempted a submit can never submit again.
Backend `release_submit()` independently enforces mode = semi-auto, checkpoint =
`submit_armed`, and status = `needs_input`, then writes a `SUBMIT_RELEASED` audit event.
Runner endpoints are gated by `Depends(verify_runner_secret)`; `release-submit` is
deliberately on the owner/UI surface, not the runner surface.

---

## 6. Required-validation deviations

Two commands in the CROSS-009 required-validation block do not pass on a clean checkout.
Neither was worked around by modifying implementation, fixtures, selectors, policies, or
assertions.

- `corepack pnpm run check` — fails on defect D-1. No change was made to the offending
  component; the failure is reported to its owning order.
- `corepack pnpm run build` — fails on defect D-2 until `JOB_ENGINE_RUNNER_SECRET` is
  supplied. Re-run with a synthetic environment-only secret
  (`JOB_ENGINE_RUNNER_SECRET=<synthetic 47-char value>`), the build passes end to end.
  Supplying an environment variable is configuration, not an implementation change.

---

## 7. Defects reported to owning orders

**D-1 — `pnpm run check` fails: `set-state-in-effect` in `CatalogBackdrop`** *(owner: the
catalog restyle work, `apps/web`; not a Batch 03 order)*
`apps/web/src/components/catalog-backdrop.tsx:22` calls `setMounted(true)` synchronously
inside an effect body, tripping `react-hooks/set-state-in-effect`. Introduced by
`637edf1 refactor(web): optimize CatalogBackdrop for reduced motion handling`. Blocks
repository-wide `check`. **Not repaired here** — outside CROSS-009 acceptance scope.

**D-2 — `pnpm run build` cannot pass from a clean checkout** *(owner: BACK-010 /
CROSS-001 configuration surface)*
`create_app()` correctly fails closed with `JOB_ENGINE_RUNNER_SECRET must be explicitly
configured with at least 32 characters`. The fail-closed behaviour is **correct and
desirable**; the defect is that `.env.example` ships `JOB_ENGINE_RUNNER_SECRET=` empty
with no generation guidance anywhere in `README.md`, `docs/development.md`, `dev.sh`, or
`ci.sh`. `ci.sh` avoids the problem only by never invoking the API build target. A first-time
operator following the documented commands hits an opaque failure.

**D-3 — Serious accessibility regression on the Live Search dialog** *(owner: FRONT-004
surface, regressed by the catalog restyle)*
`apps/web/src/features/jobs/components/LiveSyncProgressModal.tsx:127` renders
`text-emerald-600` (#009966) on #ffffff at 12px → contrast **3.65:1**, below the 4.5:1
WCAG 2 AA requirement. Axe impact: **serious**. Last touched by `4161648 feat(web):
restyle the job catalog as a catalog instrument`. Outside the Batch 03 workspace (whose
own axe scan is clean), but it fails the repository accessibility suite.

**D-4 — Documented spec filters are inert in both fixture and e2e commands** *(owner:
CROSS-009 validation block / harness owners)*
`pnpm --filter @job-engine/web run test:e2e -- embedded-application-workspace.spec.ts`
silently runs the **entire** Playwright suite; vitest 4 has the same `--` behaviour, which
`apps/desktop/scripts/run-fixtures.mjs` already works around by stripping the separator.
The web e2e script has no equivalent workaround. An operator believes they scoped the run
when they did not.

**D-5 — Stale reused dev server produces false E2E failures** *(owner: `apps/web` e2e
harness)*
`playwright.config.ts` sets `reuseExistingServer: !process.env.CI`. A `next start` process
left over from an earlier run serves a **stale bundle**, and all 8 embedded-workspace
tests fail with misleading "element not found" errors. After killing the stale
listeners on `:3005`/`:8088`, the identical spec passes 10/10. This cost real diagnostic
time and will mislead future acceptance runs.

**D-6 — `apps/web/next-env.d.ts` oscillates between build and dev** *(minor; `apps/web`)*
Next.js rewrites the tracked file between `./.next/dev/types/…` and `./.next/types/…`
depending on whether `next build` or `next dev`/`typegen` ran last, dirtying the tree on
every build. Restored during this run.

### Advisories (not defects against Batch 03 criteria)

**A-1 — `ApplicationRunCreateRequest.automation_mode` defaults to `FULL_AUTO`.**
`apps/api/src/job_engine/api/schemas.py:650`. The desktop/UI paths always send
`semi_auto_pause_before_submit` explicitly and the desktop lease fails closed on anything
else, so acceptance criterion 3 is met. `docs/automation/security-model.md:15` documents
`FULL_AUTO` as a retained backend compatibility value. Nonetheless, a **default** means any
future or third-party client that omits the field silently creates a full-auto run, and
`job_group_ids` accepts up to 25 entries. Recommend to BACK-010 that the field be made
required, or defaulted to semi-auto, as defense in depth.

**A-2 — Test TLS private key committed.** `apps/desktop/tests/fixtures/certs.ts` contains a
PEM private key. It is a self-signed key for loopback HTTPS fixture servers and is
correctly test-scoped, but it will trip repository secret scanners.

**A-3 — Owner's real name used as fixture data.** `"Guilherme"` / `"Guilherme Fortuna"`
appears as synthetic applicant values in `apps/api/tests/**` and `apps/desktop/tests/**`.
No contact details, address, or resume bytes are exposed, and nothing appears in committed
*evidence or logs*, so criterion 8 is met. A clearly fictional persona would nonetheless be
cleaner for a repository that may become public.

---

## 8. Coverage gaps (disclosed, not defects)

- **G-1 — Induced renderer crash not exercised.** Scenario A.4 names crashing the remote
  renderer. Recovery is verified structurally (checkpoint ordering, reopen, session
  partition survival, lease loss) but no test kills the remote `WebContentsView` process
  and asserts recovery.
- **G-2 — Greenhouse has no real-backend lifecycle driver.** Generic and Lever each have a
  driver against the real FastAPI backend and PostgreSQL; Greenhouse's release/receipt path
  is exercised against the mock runner API only. Scenario C.1 is satisfied, but the
  Greenhouse evidence is one notch weaker than Lever's.
- **G-3 — Generated-answer coverage conditional.** `PROVIDER-PRIVACY-001` is OPEN, so only
  the deterministic answer provider was exercised. Narrative generation correctly pauses in
  `NEEDS_INPUT` and was not evaluated for quality.
- **G-4 — No live evidence of any kind.** No live inspection, no live mutation, no live
  submission. Selector durability, production authentication, real challenge behaviour, and
  actual platform submission support are **unproven**.

---

## 9. Conditions attached to this `CONDITIONAL_GO`

Batch 03 may be accepted as functionally complete. The following remain open and must not
be represented as satisfied:

1. Production ATS support is **not** established. `LEGAL-GATE-ATS-001` must be resolved by
   the owner for an exact platform and target job before any live mutation or submission.
2. Generated-answer coverage is conditional pending `PROVIDER-PRIVACY-001`.
3. Scenario C.4 live non-submitting inspection must be run once the owner names targets.
4. D-1 and D-3 must be fixed for repository-wide `check` and the accessibility suite to be
   green; both are outside Batch 03 assisted-apply code.
5. D-2 and D-4 should be fixed before the next acceptance run so the documented validation
   block is executable as written.

---

## 10. Artifact hashes

| Artifact | SHA-256 |
| --- | --- |
| `apps/desktop/tests/fixtures/generic-form-server.ts` | `a177ed719a38302f1f309e7b909b34c4f12f860569f7111153cc68b0b2c057ff` |
| `apps/desktop/tests/fixtures/greenhouse/greenhouse-form-server.ts` | `129e3cdb3ef448ef88e0e906b645fd0008c521f8021b0e407f0651ea001f3c52` |
| `apps/desktop/tests/fixtures/lever/lever-form-server.ts` | `eb98913ba80454e902c4c8a9aad4c370430a90120493d87548551a213592fe54` |
| `apps/desktop/tests/fixtures/mock-runner-api.ts` | `1ddf3547164acaf9c306191a9833dbbb3ef5b929679b9dc9b983cb2add563e00` |
| `apps/web/e2e/embedded-application-workspace.spec.ts` | `d0577022a9d21645b17f724e22e0d1665e508fc72305b09214c806af04eef9ac` |

Scenario-level transcripts: `docs/evidence/embedded-assisted-apply/scenario-matrix.md`.

---

## 11. Statement of independence

No implementation code, fixture, selector, threshold, policy, or assertion was modified to
produce this result. The only non-source action taken was supplying
`JOB_ENGINE_RUNNER_SECRET` as an environment variable (§6) and terminating stale local test
servers (D-5). No live form was loaded, mutated, or submitted. No approval status was
changed. All defects are reported to their owning orders rather than repaired here.

---

## 12. Post-acceptance remediation addendum (2026-08-19)

Recorded after the `CONDITIONAL_GO` above. The original decision stands on its
own evidence; this section records what changed afterwards and who authorised it.

**Round 1 — commits `6053a25`, `779ea45` (implementation side).** Re-verified
against HEAD `779ea45`:

| Defect | Status | Verification |
| --- | --- | --- |
| D-1 `set-state-in-effect` | **FIXED** | `CatalogBackdrop` rewritten with `useSyncExternalStore`; `pnpm run check` exit 0 |
| D-3 contrast 3.65:1 | **FIXED** | `text-emerald-600` → `emerald-700`; full Playwright suite green including the axe audit |
| D-4 inert `--` filter | **FIXED** | `apps/web/scripts/run-e2e.mjs` strips the separator; scoped run reports 10 tests, not 26 |
| D-5 stale server reuse | **FIXED (CI path)** | `export CI=true` in `scripts/ci-lib.sh` plus `assert_listen_port_free` |
| D-6 `next-env.d.ts` drift | **FIXED** | `next typegen` no longer dirties the tree |
| D-2 build on clean checkout | **NOT FIXED** | still failed; CI never built the API |

That round also fixed an unrelated defect not in this report: `resolved_evidence_root`
lacked `.expanduser()`, so the documented `~/.job-engine/evidence` default would
have created a literal `~` directory inside the repository.

**Round 2 — owner-instructed remediation.** The owner directed the acceptance
agent to repair the outstanding items. This is a deliberate, recorded departure
from the CROSS-009 forbidden decision "do not repair product code": it happened
**after** the decision was issued, on explicit owner instruction, and no
assertion was weakened to manufacture a pass. One assertion was *corrected* —
see G-1 below.

| Item | Resolution |
| --- | --- |
| **D-2** | `apps/api` build target is now `scripts/build_smoke.py`, which injects explicit throwaway `Settings` instead of demanding an operator secret to smoke-test the import graph. The 32-character runner-secret rule is a *server startup* guard and remains enforced by `create_app()` and covered by `tests/test_health.py`. `pnpm run build` now passes on a clean checkout with no environment at all. New `scripts/ci-backend-build.sh` and a `backend-build` GitHub Actions job run it with `JOB_ENGINE_RUNNER_SECRET` explicitly unset so the regression cannot return. `.env.example` now carries a generation command; `dev.sh` mints a real secret when it creates `.env`; `docs/development.md` documents both. |
| **D-5 residual** | `reuseExistingServer` no longer keys off `CI`. It is now opt-in via `E2E_REUSE_SERVER=1`, so a direct `pnpm run test:e2e` also starts fresh servers. Documented in `docs/development.md`. |
| **A-1** | `ApplicationRunCreateRequest.automation_mode` is now **required and un-defaulted**. Every existing caller already passed it explicitly, so no client broke. New regression test asserts a POST omitting the field returns 422 and that direct model construction raises `ValidationError`. |
| **A-2** | The committed PEM private key is gone. `tests/fixtures/certs.ts` now generates a 2048-bit self-signed loopback certificate in-process via `node-forge` at import time. Generation is synchronous, so the fixture servers still build their `https.Server` in a constructor. A repository-wide scan for `BEGIN … PRIVATE KEY` now returns nothing. |
| **A-3** | The owner's real name is gone from fixture data, replaced by the fictional "Dakota Rivera" / `dakota@example.com`. The `config.py` occurrences are the GitHub repository URL (legitimate attribution) and were left. The isolated-world "unicode" hostile-transport case previously carried a pure-ASCII name; it now carries genuinely non-ASCII text (`Zoë Ünlü — 東京 🎯`), which strengthens that assertion. |
| **G-1** | `electron-test-runner.ts` gained case 9, which calls `forcefullyCrashRenderer()` on the live remote view, then asserts the crash reason is `CRASHED`, the `WebContentsView` is disposed, its `webContents` is destroyed, and a subsequent reopen recovers the dedicated session with the reason cleared. The first draft asserted `runId === null`; that was **the test being wrong, not the product**. `closeApplication(false)` deliberately preserves the run so the trusted UI can display the crash reason — a full reset would wipe `blockedNavigationReason` too. The assertion was corrected to the property that actually matters (view disposal). |
| **G-2** | New `greenhouse/greenhouse-lifecycle-runner.ts` + `greenhouse-lifecycle.test.ts` drive Greenhouse against the **real FastAPI backend and PostgreSQL**, 12 cases mirroring the Lever lifecycle: claim, resume fetch/verify, detect, unresolved legal attestation, authorised fill, upload to `READY_FOR_REVIEW` without replaying earlier fills, arm, refusal before release, release + same-run reclaim, one confirmed submit, no second submit, ambiguous receipt not re-activated. Greenhouse evidence is now at parity with Lever. |

**A note on what G-2 revealed.** An intermediate draft asserted the run would
pause with `NEEDS_ANSWERS` on the required sponsorship question. It did not: the
backend answer policy resolves that question from the seeded vault, and the only
genuine blocker was an unfilled last name. The assertion was removed rather than
engineered into passing — pause behaviour is already covered by the attestation
case here and by the Greenhouse runtime runner's eight exception cases.

### Remaining open after remediation

- `LEGAL-GATE-ATS-001` and `PROVIDER-PRIVACY-001` are **still OPEN**. Nothing in
  this round touched them.
- Scenario **C.4** (owner-authorised live non-submitting inspection) is still
  **not performed**, and still requires the owner to name a target.
- **G-3** and **G-4** stand unchanged: generated-answer coverage is conditional,
  and there is still no live evidence of any kind.
- Therefore the decision remains **`CONDITIONAL_GO`**. Remediation closed the
  repository-hygiene and coverage items; it did not and could not close the
  legal, provider, or live-evidence gates.

### Post-remediation validation

```
corepack pnpm run check                              exit 0
corepack pnpm run test                               api 320 passed / 3 skipped
                                                     desktop 282 passed
                                                     web 137 passed
pnpm run build (with NO env at all)                  exit 0
pnpm --filter @job-engine/desktop run test:fixtures  7 files / 7 passed
pnpm --filter @job-engine/web run test:e2e           26 passed
git diff --check                                     clean
scan for committed PEM private keys                  none
scan for owner personal data in fixtures             none
```

One flake was observed and hardened during this round: the Live Search axe audit
failed once with `document-title` when a scan raced the navigation. Titles are
defined server-side in `layout.tsx` and `jobs/page.tsx`, three consecutive full
suites passed 26/26, and the test now awaits `toHaveTitle` before scanning.
