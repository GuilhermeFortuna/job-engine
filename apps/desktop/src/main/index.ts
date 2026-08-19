import path from "node:path";
import { app, BrowserWindow } from "electron";
import { IPC_CHANNELS } from "../shared/contracts";
import { ApplicationViewManager } from "./application-view";
import { loadDesktopConfig } from "./config";
import { registerIpcHandlers } from "./ipc";
import { configureApplicationSession } from "./session";
import { createMainWindow } from "./window";

let mainWindow: BrowserWindow | null = null;
let viewManager: ApplicationViewManager | null = null;

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

  registerIpcHandlers(viewManager, config);

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
      if (viewManager) {
        viewManager.closeApplication();
      }
      mainWindow = null;
    }
  );

  viewManager.subscribeState((state) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.BROWSER_STATE_CHANGED, state);
    }
  });
}

app.whenReady().then(initializeApp).catch((err) => {
  console.error("Fatal error during desktop initialization:", err);
  app.quit();
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
