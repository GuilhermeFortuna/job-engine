import path from "node:path";
import { app, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../shared/contracts";
import { ApplicationViewManager } from "./application-view";
import { loadDesktopConfig } from "./config";
import { registerIpcHandlers } from "./ipc";
import { createDefaultAdapterRegistry } from "./adapters/registry";
import { RuntimeCoordinator } from "./runtime/coordinator";
import { LeaseManager } from "./runtime/lease";
import { RunnerClient } from "./runtime/runner-client";
import { configureApplicationSession } from "./session";
import { createMainWindow } from "./window";

if (process.env.NODE_ENV === "test") {
  app.commandLine.appendSwitch("no-sandbox");
  app.commandLine.appendSwitch("disable-gpu");
  app.commandLine.appendSwitch("headless");
  app.commandLine.appendSwitch("ozone-platform", "headless");
  app.commandLine.appendSwitch("disable-dev-shm-usage");
  app.commandLine.appendSwitch("ignore-certificate-errors");
  app.disableHardwareAcceleration();
}

let mainWindow: BrowserWindow | null = null;
let viewManager: ApplicationViewManager | null = null;
let coordinator: RuntimeCoordinator | null = null;

async function initializeApp(): Promise<void> {
  const config = loadDesktopConfig();

  if (config.userDataDir) {
    app.setPath("userData", config.userDataDir);
  }

  const appSession = configureApplicationSession(config, (url) => {
    if (viewManager) {
      viewManager.onDownloadDenied(url);
    }
  });

  viewManager = new ApplicationViewManager(
    () => mainWindow,
    appSession,
    config
  );

  const client = new RunnerClient(config.apiBaseUrl, {
    runnerSecret: config.runnerSecret,
    runnerId: "desktop-production-runner",
  });
  coordinator = new RuntimeCoordinator({
    config,
    viewManager,
    client,
    leaseManager: new LeaseManager(client),
    adapterRegistry: createDefaultAdapterRegistry(),
  });

  registerIpcHandlers(viewManager, config, coordinator);

  const preloadPath = path.join(__dirname, "..", "preload", "index.js");

  mainWindow = createMainWindow(
    config,
    preloadPath,
    () => {
      if (viewManager) {
        viewManager.handleWindowResize();
      }
    },
    () => {
      if (coordinator) {
        void coordinator.dispose();
      }
      mainWindow = null;
    }
  );

  viewManager.subscribeState((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.BROWSER_STATE_CHANGED, state);
    }
  });

  coordinator.subscribeState((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.RUNTIME_STATE_CHANGED, state);
    }
  });
}

app.whenReady().then(initializeApp).catch((err) => {
  console.error("Fatal error during desktop initialization:", err);
  app.quit();
});

app.on("before-quit", () => {
  if (coordinator) {
    void coordinator.dispose();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    initializeApp().catch((err) => {
      console.error("Failed to re-initialize window:", err);
    });
  }
});
