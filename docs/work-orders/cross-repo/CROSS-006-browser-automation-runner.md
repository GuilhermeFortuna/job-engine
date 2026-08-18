# CROSS-006: Electron Embedded-Browser Foundation

**Status:** `READY`

**Owner:** Unassigned

**Depends on:** CROSS-005, BACK-009, BACK-010, BACK-011

**Unblocks:** CROSS-010

**Product spec:** `docs/v2-assisted-apply-spec.md`

## Objective

Create the secure local Electron shell that hosts the existing Next.js application and one main-process-owned `WebContentsView` for an owner-selected application run. Prove browser-session persistence, trusted typed IPC, URL containment, view positioning, and restart behavior without implementing form observation, filling, uploads, ATS selectors, or submission.

## Owned files

- `/apps/desktop/package.json` (new)
- `/apps/desktop/tsconfig.json` (new)
- `/apps/desktop/vitest.config.ts` (new)
- `/apps/desktop/src/main/index.ts` (new)
- `/apps/desktop/src/main/config.ts` (new)
- `/apps/desktop/src/main/window.ts` (new)
- `/apps/desktop/src/main/application-view.ts` (new)
- `/apps/desktop/src/main/navigation-policy.ts` (new)
- `/apps/desktop/src/main/session.ts` (new)
- `/apps/desktop/src/main/api-client.ts` (new)
- `/apps/desktop/src/main/ipc.ts` (new)
- `/apps/desktop/src/preload/index.ts` (new)
- `/apps/desktop/src/shared/contracts.ts` (new)
- `/apps/desktop/tests/**` (new; foundation tests only)
- `/package.json` (desktop scripts only)
- `/pnpm-lock.yaml` (dependency resolution only)
- `/.env.example` (non-secret desktop settings only)
- `/.gitignore` (desktop runtime data only)
- `/docs/development.md` (desktop startup and troubleshooting only)

Do not edit `/apps/web`, backend schemas/routes, platform adapters, or product styling in this order.

## Fixed runtime contract

- Pin `electron@43.2.0`. Do not use Tauri, CEF, a browser extension, `<webview>`, deprecated `BrowserView`, or Playwright as the product browser.
- The trusted `BrowserWindow` loads exactly `JOB_ENGINE_WEB_ORIGIN`, defaulting to `http://127.0.0.1:3000`. Reject non-loopback configuration and unexpected redirects.
- The application page uses one `WebContentsView`, created and controlled only by the main process.
- The initial application URL is resolved by run ID through `GET /api/v1/application-runs/{run_id}`. IPC must not accept an arbitrary URL.
- The application view uses a dedicated persistent Electron session partition and an optional `JOB_ENGINE_DESKTOP_USER_DATA_DIR` outside the repository. It never attaches to or copies a normal Chrome/Chromium profile.
- The remote view has `nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`, `webSecurity: true`, `allowRunningInsecureContent: false`, no preload, and no Electron/Node bridge.
- Deny all permission requests by default. Deny downloads, external protocols, unapproved popups, and non-HTTPS navigation. Parse URLs with `URL`; never authorize with string-prefix matching.
- Dispose the child `webContents` explicitly when its `WebContentsView` is removed or the owning window closes.

## Typed bridge contract

The trusted preload exposes only `window.jobEngineDesktop` with these operations:

- `getCapabilities() -> { embeddedBrowser: true, platform: string }`
- `openApplication({ runId: string })`
- `setApplicationBounds({ x, y, width, height, devicePixelRatio })`
- `closeApplication()`
- `goBack()`, `goForward()`, `reload()`
- `subscribeBrowserState(listener)` returning an unsubscribe function

The sanitized browser-state event contains only run ID, safe URL origin/path display, title, loading state, can-go-back/forward flags, and a closed blocked-navigation reason. Do not expose `ipcRenderer`, Electron events, cookies, response bodies, DOM content, headers, tokens, or `webContents` IDs.

Every main-process handler validates the sender frame against the exact trusted local renderer origin and validates request data with closed runtime checks. Remote frames must be unable to invoke any handler.

## Procedure

1. Scaffold `@job-engine/desktop` in the existing pnpm workspace with repository-standard `dev`, `check`, `test`, and `build` scripts.
2. Implement validated configuration for the exact web/API loopback origins and dedicated user-data location. Secrets are read in the main process only.
3. Create the trusted application window, isolated preload bridge, and sender validation.
4. Implement `WebContentsView` lifecycle, React-reported bounds, minimum-size clipping, focus transfer, back/forward/reload, loading/title events, and explicit disposal.
5. Resolve `runId` through the API and open only that run's validated HTTPS application URL.
6. Enforce navigation, redirect, frame, popup, download, permission, protocol, and crash policies. Return sanitized reasons to the trusted renderer.
7. Add a synthetic local HTTPS fixture harness proving same-flow navigation and session persistence. Do not contact an employer or use personal data.
8. Prove close/reopen and full desktop restart preserve only the dedicated application session and do not orphan a renderer process or profile lock.

## Required validation

```bash
corepack pnpm install --frozen-lockfile
corepack pnpm --filter @job-engine/desktop run check
corepack pnpm --filter @job-engine/desktop run test
corepack pnpm --filter @job-engine/desktop run build
corepack pnpm --filter @job-engine/desktop run test:fixtures
git diff --check
```

## Acceptance criteria

- The current Next.js app opens as the trusted desktop renderer and an API-resolved synthetic run opens visibly in a correctly positioned `WebContentsView`.
- Bounds follow window resize and trusted layout reports without allowing negative, non-finite, off-window, or unreasonably large rectangles.
- Dedicated cookies survive desktop restart; no normal browser data is read or modified.
- Unapproved navigation, redirects, child frames, popups, downloads, permission prompts, external protocols, and non-HTTPS targets fail closed with actionable trusted-UI state.
- A hostile remote fixture cannot access Node, Electron, preload APIs, runner credentials, API data, filesystem paths, or trusted IPC.
- Closing or crashing the view disposes it safely and permits a clean reopen.
- No form observation, fill, upload, adapter, or submit behavior is introduced.

## Forbidden decisions

- Do not expose arbitrary URL loading, arbitrary JavaScript execution, raw IPC, `webContents`, cookies, filesystem access, or secrets to React or remote content.
- Do not enable Node integration, disable context isolation/sandbox/web security, or attach a preload to the remote view.
- Do not load the Next.js UI from a non-loopback origin.
- Do not add an installer, updater, code signing, analytics, browser extension, or production packaging system.
- Do not alter BACK-009, BACK-010, or BACK-011 contracts.
- Do not implement form automation or ATS-specific behavior in this order.

## Handoff evidence

- Runtime/dependency and local startup summary
- IPC surface and sender-validation inventory
- Navigation/permission/popup/download denial matrix
- Session persistence, restart, view-disposal, and bounds evidence
- Hostile-fixture isolation transcript
- Full desktop-package validation transcript

## Dispatch record

- Worker: Unassigned
- Branch/worktree: `development`
- Dispatched at: Not dispatched

## Completion record

- Commit: Pending
- Evidence: Pending
- Independent reviewer: Pending
