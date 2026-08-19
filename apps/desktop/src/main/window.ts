import { BrowserWindow } from "electron";
import { DesktopConfig } from "./config";

export function createMainWindow(
  config: DesktopConfig,
  preloadPath: string,
  onResize?: () => void,
  onClose?: () => void
): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1366,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    show: !config.isTest,
    webPreferences: {
      preload: preloadPath,
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
      offscreen: config.isTest,
    },
  });

  // Confine the main window strictly to the trusted web origin
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsed = new URL(url);
      if (parsed.origin !== config.webOrigin) {
        event.preventDefault();
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.webContents.setWindowOpenHandler(() => {
    return { action: "deny" };
  });

  if (onResize) {
    mainWindow.on("resize", () => {
      onResize();
    });
  }

  if (onClose) {
    mainWindow.on("closed", () => {
      onClose();
    });
  }

  mainWindow.loadURL(config.webOrigin).catch((err) => {
    console.error(`Failed to load trusted web origin ${config.webOrigin}:`, err);
  });

  return mainWindow;
}
