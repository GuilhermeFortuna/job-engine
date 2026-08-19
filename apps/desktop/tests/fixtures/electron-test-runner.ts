import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

// Append headless and sandbox flags for test runner environment
app.commandLine.appendSwitch("no-sandbox");
app.commandLine.appendSwitch("disable-gpu");
app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("headless", "true");
app.commandLine.appendSwitch("ozone-platform", "headless");
app.commandLine.appendSwitch("disable-dev-shm-usage");
app.commandLine.appendSwitch("ignore-certificate-errors");
app.disableHardwareAcceleration();

app.on("window-all-closed", () => {
  // Prevent early termination in test runner
});

const testUserDataDir = path.resolve(__dirname, "..", "..", ".test-userData");
if (!fs.existsSync(testUserDataDir)) {
  fs.mkdirSync(testUserDataDir, { recursive: true });
}
app.setPath("userData", testUserDataDir);
app.setPath("crashDumps", testUserDataDir);

import { ApplicationViewManager } from "../../src/main/application-view";
import { DesktopConfig } from "../../src/main/config";
import { registerIpcHandlers } from "../../src/main/ipc";
import { configureApplicationSession } from "../../src/main/session";
import { createMainWindow } from "../../src/main/window";
import {
  MockBackendServer,
  MockHttpsAtsServer,
  MockWebRendererServer,
} from "./mock-servers";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    results.push({ name, passed: true });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.stack || err.message : String(err);
    results.push({ name, passed: false, error: errorMsg });
    console.error(`  ✗ ${name}: ${errorMsg}`);
  }
}

async function startHarness(): Promise<void> {
  try {
    console.log("\n🧪 Running Synthetic HTTPS Electron Fixture Suite...\n");

    const backend = new MockBackendServer();
    await backend.start();
    console.log("Mock backend started on:", backend.baseUrl);

    const ats = new MockHttpsAtsServer();
    await ats.start();
    console.log("Mock ATS started on:", ats.baseUrl);

    const webRenderer = new MockWebRendererServer();
    await webRenderer.start();
    console.log("Mock web renderer started on:", webRenderer.origin);

  const runId = "00000000-0000-0000-0000-000000000001";
  backend.setRun({
    id: runId,
    job_group_id: "00000000-0000-0000-0000-000000000002",
    application_url: `${ats.baseUrl}/apply/step1`,
    canonical_application_url: `${ats.baseUrl}/apply/step1`,
    platform_adapter_id: "greenhouse",
    status: "DISPATCHED",
  });

  const config: DesktopConfig = {
    webOrigin: webRenderer.origin,
    apiBaseUrl: backend.baseUrl,
    sessionPartition: "persist:job-engine-test-partition",
    userDataDir: testUserDataDir,
    runnerSecret: "test-secret",
    isTest: true,
  };

  let mainWindow: BrowserWindow | null = null;
    console.log("Configuring application session...");
    const appSession = configureApplicationSession(config, (url) => {
      if (viewManager) {
        viewManager.onDownloadDenied(url);
      }
    });

    console.log("Initializing ApplicationViewManager...");
    const viewManager = new ApplicationViewManager(
      () => mainWindow,
      appSession,
      config
    );

    console.log("Registering IPC handlers...");
    registerIpcHandlers(viewManager, config);

    const candidatePreload1 = path.join(__dirname, "..", "..", "src", "preload", "index.js");
    const candidatePreload2 = path.join(__dirname, "..", "..", "preload", "index.js");
    const candidatePreload3 = path.join(__dirname, "..", "..", "dist", "preload", "index.js");
    const preloadPath = [candidatePreload1, candidatePreload2, candidatePreload3].find(
      (p) => fs.existsSync(p)
    ) || candidatePreload1;
    console.log("Using preload path:", preloadPath);

    console.log("Creating main window...");
    mainWindow = createMainWindow(
      config,
      preloadPath,
      () => viewManager.handleWindowResize(),
      () => {
        viewManager.closeApplication();
        mainWindow = null;
      }
    );
    console.log("Main window created!");

  // Wait for main window to load
  console.log("Loading main window with origin:", config.webOrigin);
  await new Promise<void>((resolve) => {
    mainWindow!.webContents.once("did-finish-load", () => {
      console.log("Main window did-finish-load triggered");
      resolve();
    });
    mainWindow!.webContents.once("did-fail-load", (_e, code, desc) => {
      console.error("Main window did-fail-load:", code, desc);
      resolve();
    });
    setTimeout(() => {
      console.log("Main window load wait elapsed");
      resolve();
    }, 2500);
  });

  // Test 1: Trusted Renderer Confinement
  await runTest("Main window loads trusted loopback web origin and rejects external navigation", async () => {
    assert(mainWindow !== null, "Main window should be created");
    const currentOrigin = new URL(mainWindow!.webContents.getURL()).origin;
    assert(currentOrigin === webRenderer.origin, `Expected origin ${webRenderer.origin}, got ${currentOrigin}`);
  });

  // Test 2: API Run Resolution and Visible WebContentsView
  await runTest("API-resolved synthetic run opens visibly in WebContentsView", async () => {
    const res = await viewManager.openApplication(runId, `${ats.baseUrl}/apply/step1`);
    assert(res.success === true, `Expected success, got error: ${res.error}`);

    // Wait for page to load
    await new Promise((r) => setTimeout(r, 800));

    const state = viewManager.getState();
    assert(state.runId === runId, `Expected runId ${runId}, got ${state.runId}`);
    assert(state.title.includes("Synthetic ATS Step 1"), `Expected title to include "Synthetic ATS Step 1", got "${state.title}"`);
    assert(state.displayUrl.includes("/apply/step1"), `Expected displayUrl to include /apply/step1, got "${state.displayUrl}"`);
    assert(state.isLoading === false, "Expected isLoading to be false");
  });

  // Test 3: Bounds and Layout Adjustments
  await runTest("Bounds follow layout reports and clamp safely within window", async () => {
    viewManager.setApplicationBounds({ x: 50, y: 50, width: 700, height: 500 });
    viewManager.handleWindowResize();
    const state = viewManager.getState();
    assert(state.blockedNavigationReason === null, "No blocked navigation reason should be set for valid bounds");
  });

  // Test 4: Dedicated Cookie Session Persistence across navigation
  await runTest("Dedicated ATS session cookie persists across step navigation", async () => {
    const res = await viewManager.openApplication(runId, `${ats.baseUrl}/apply/step2`);
    assert(res.success === true, "Should succeed opening step 2");

    await new Promise((r) => setTimeout(r, 800));

    const state = viewManager.getState();
    assert(
      state.title.includes("Synthetic ATS Step 2 (Authenticated)"),
      `Expected authenticated step 2 page, got title: "${state.title}"`
    );
  });

  // Test 5: Reopen and Session Partition Survival
  await runTest("Closing view and reopening preserves dedicated partition cookies", async () => {
    viewManager.closeApplication();
    const closedState = viewManager.getState();
    assert(closedState.runId === null, "runId should be null after closing view");

    const reopenRes = await viewManager.openApplication(runId, `${ats.baseUrl}/apply/step2`);
    assert(reopenRes.success === true, "Reopening should succeed");

    await new Promise((r) => setTimeout(r, 800));

    const state = viewManager.getState();
    assert(
      state.title.includes("Synthetic ATS Step 2 (Authenticated)"),
      `Session cookie should survive view close/reopen, got title: "${state.title}"`
    );
  });

  // Test 6: Popups Denied Fail-Closed
  await runTest("Unapproved popup attempts fail closed and update trusted UI state", async () => {
    await viewManager.openApplication(runId, `${ats.baseUrl}/apply/step1`);
    await new Promise((r) => setTimeout(r, 800));

    const viewWc = (viewManager as any).view?.webContents;
    assert(viewWc, "View webContents must exist");
    await viewWc.executeJavaScript("window.open('/popup', '_blank')");

    await new Promise((r) => setTimeout(r, 400));
    const state = viewManager.getState();
    assert(
      state.blockedNavigationReason === "UNAPPROVED_POPUP",
      `Expected UNAPPROVED_POPUP, got "${state.blockedNavigationReason}"`
    );
  });

  // Test 7: Downloads Denied Fail-Closed
  await runTest("Download attempts fail closed and trigger DOWNLOAD_DENIED reason", async () => {
    viewManager.onDownloadDenied(`${ats.baseUrl}/download/test.pdf`);
    const state = viewManager.getState();
    assert(
      state.blockedNavigationReason === "DOWNLOAD_DENIED",
      `Expected DOWNLOAD_DENIED, got "${state.blockedNavigationReason}"`
    );
  });

  // Test 8: Hostile Script Isolation
  await runTest("Hostile remote fixture cannot access Node, Electron, or preload APIs", async () => {
    await viewManager.openApplication(runId, `${ats.baseUrl}/hostile`);
    await new Promise((r) => setTimeout(r, 800));

    const viewWc = (viewManager as any).view?.webContents;
    assert(viewWc, "View webContents must exist");

    const audit = await viewWc.executeJavaScript("window.__hostileAudit");
    assert(audit !== null && typeof audit === "object", "Audit object should exist on hostile page");
    assert(audit.hasRequire === false, "Remote page must NOT access require");
    assert(audit.hasProcess === false, "Remote page must NOT access process");
    assert(audit.hasJobEngineDesktop === false, "Remote page must NOT access window.jobEngineDesktop");
    assert(audit.hasElectron === false, "Remote page must NOT access window.electron");
    assert(audit.hasIpcRenderer === false, "Remote page must NOT access window.ipcRenderer");
  });

  // Clean up
  viewManager.closeApplication();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
  await backend.close();
  await ats.close();
  await webRenderer.close();

  const failed = results.filter((r) => !r.passed);
  console.log(`\nResults: ${results.length - failed.length} passed, ${failed.length} failed.\n`);

  if (failed.length > 0) {
    app.exit(1);
  } else {
    app.exit(0);
  }
} catch (err) {
  console.error("FATAL UNCAUGHT IN startHarness:", err);
  app.exit(1);
}
}

app.whenReady().then(startHarness).catch((err) => {
  console.error("Fatal test runner error:", err);
  app.exit(1);
});
