import { BrowserWindow, Session, WebContentsView } from "electron";
import {
  ApplicationBounds,
  BlockedNavigationReason,
  DesktopBrowserState,
  INITIAL_BROWSER_STATE,
  OperationResult,
} from "../shared/contracts";
import { DesktopConfig } from "./config";
import {
  sanitizeDisplayUrl,
  validateNavigationUrl,
} from "./navigation-policy";

export interface ClampedBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function validateAndClampBounds(
  rawBounds: ApplicationBounds,
  windowContentSize: { width: number; height: number }
): ClampedBounds {
  const x = Number.isFinite(rawBounds.x) ? Math.round(rawBounds.x) : 0;
  const y = Number.isFinite(rawBounds.y) ? Math.round(rawBounds.y) : 0;
  const width = Number.isFinite(rawBounds.width) ? Math.round(rawBounds.width) : 0;
  const height = Number.isFinite(rawBounds.height)
    ? Math.round(rawBounds.height)
    : 0;

  const safeX = Math.max(0, Math.min(x, windowContentSize.width));
  const safeY = Math.max(0, Math.min(y, windowContentSize.height));

  const maxWidth = Math.max(0, windowContentSize.width - safeX);
  const maxHeight = Math.max(0, windowContentSize.height - safeY);

  const clampedWidth = Math.max(0, Math.min(width, maxWidth));
  const clampedHeight = Math.max(0, Math.min(height, maxHeight));

  return {
    x: safeX,
    y: safeY,
    width: clampedWidth,
    height: clampedHeight,
  };
}

export class ApplicationViewManager {
  private view: WebContentsView | null = null;
  private currentRunId: string | null = null;
  private state: DesktopBrowserState = { ...INITIAL_BROWSER_STATE };
  private lastReportedBounds: ApplicationBounds | null = null;
  private stateListeners: Set<(state: DesktopBrowserState) => void> = new Set();

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly appSession: Session,
    private readonly config: DesktopConfig
  ) {}

  public subscribeState(
    listener: (state: DesktopBrowserState) => void
  ): () => void {
    this.stateListeners.add(listener);
    listener(this.getState());
    return () => {
      this.stateListeners.delete(listener);
    };
  }

  public getState(): DesktopBrowserState {
    return { ...this.state };
  }

  private emitState(): void {
    const currentState = this.getState();
    for (const listener of this.stateListeners) {
      try {
        listener(currentState);
      } catch {
        // Ignore listener errors
      }
    }
  }

  private updateNavFlags(): void {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.state.canGoBack = this.view.webContents.canGoBack();
      this.state.canGoForward = this.view.webContents.canGoForward();
    } else {
      this.state.canGoBack = false;
      this.state.canGoForward = false;
    }
  }

  public async openApplication(
    runId: string,
    targetUrl: string
  ): Promise<OperationResult> {
    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) {
      return { success: false, error: "Main window is not available" };
    }

    const validation = validateNavigationUrl(targetUrl, this.config.isTest);
    if (!validation.allowed) {
      this.state.blockedNavigationReason = validation.reason;
      this.emitState();
      return {
        success: false,
        error: `URL navigation blocked: ${validation.reason}`,
      };
    }

    // Safely dispose existing view if any
    this.closeApplication();

    this.currentRunId = runId;
    this.state = {
      runId,
      displayUrl: validation.sanitizedUrl,
      title: "",
      isLoading: true,
      canGoBack: false,
      canGoForward: false,
      blockedNavigationReason: null,
    };
    this.emitState();

    try {
      const view = new WebContentsView({
        webPreferences: {
          session: this.appSession,
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          webSecurity: true,
          allowRunningInsecureContent: false,
          spellcheck: false,
          offscreen: this.config.isTest,
        },
      });

      this.view = view;
      const wc = view.webContents;

      // Popup handler: strictly deny all popups
      wc.setWindowOpenHandler(() => {
        this.state.blockedNavigationReason = "UNAPPROVED_POPUP";
        this.emitState();
        return { action: "deny" };
      });

      // Navigation listeners
      wc.on("will-navigate", (event, url) => {
        const check = validateNavigationUrl(url, this.config.isTest);
        if (!check.allowed) {
          event.preventDefault();
          this.state.blockedNavigationReason = check.reason;
          this.emitState();
        }
      });

      wc.on("will-redirect", (event, url) => {
        const check = validateNavigationUrl(url, this.config.isTest);
        if (!check.allowed) {
          event.preventDefault();
          this.state.blockedNavigationReason = check.reason;
          this.emitState();
        }
      });

      wc.on("will-frame-navigate", (event) => {
        const check = validateNavigationUrl(event.url, this.config.isTest);
        if (!check.allowed) {
          event.preventDefault();
        }
      });

      wc.on("did-start-loading", () => {
        this.state.isLoading = true;
        this.emitState();
      });

      wc.on("did-stop-loading", () => {
        this.state.isLoading = false;
        this.updateNavFlags();
        this.emitState();
      });

      wc.on("page-title-updated", (_event, title) => {
        this.state.title = title;
        this.emitState();
      });

      wc.on("did-navigate", (_event, url) => {
        this.state.displayUrl = sanitizeDisplayUrl(url);
        this.updateNavFlags();
        this.emitState();
      });

      wc.on("did-navigate-in-page", (_event, url) => {
        this.state.displayUrl = sanitizeDisplayUrl(url);
        this.updateNavFlags();
        this.emitState();
      });

      wc.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
        // -3 is ABORTED (e.g. redirected or stopped intentionally)
        if (errorCode !== -3) {
          this.state.isLoading = false;
          this.state.blockedNavigationReason = "LOAD_FAILED";
          this.emitState();
        }
      });

      wc.on("render-process-gone", (_event, details) => {
        this.state.isLoading = false;
        this.state.blockedNavigationReason = "CRASHED";
        this.closeApplication(false);
        this.emitState();
      });

      mainWindow.contentView.addChildView(view);

      // Apply bounds if already reported
      if (this.lastReportedBounds) {
        this.applyBounds(this.lastReportedBounds);
      } else {
        // Default to a sensible layout inside window
        const [w, h] = mainWindow.getContentSize();
        view.setBounds({ x: 0, y: 0, width: w, height: h });
      }

      await wc.loadURL(targetUrl);
      return { success: true };
    } catch (err) {
      this.state.isLoading = false;
      this.state.blockedNavigationReason = "LOAD_FAILED";
      this.emitState();
      return {
        success: false,
        error: `Failed to load application URL: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }

  public setApplicationBounds(bounds: ApplicationBounds): OperationResult {
    this.lastReportedBounds = bounds;
    this.applyBounds(bounds);
    return { success: true };
  }

  public applyBounds(bounds: ApplicationBounds): void {
    if (!this.view) return;
    const mainWindow = this.getMainWindow();
    if (!mainWindow || mainWindow.isDestroyed()) return;

    const [windowWidth, windowHeight] = mainWindow.getContentSize();
    const clamped = validateAndClampBounds(bounds, {
      width: windowWidth,
      height: windowHeight,
    });
    this.view.setBounds(clamped);
  }

  public handleWindowResize(): void {
    if (this.lastReportedBounds) {
      this.applyBounds(this.lastReportedBounds);
    }
  }

  public closeApplication(resetState: boolean = true): OperationResult {
    if (this.view) {
      const mainWindow = this.getMainWindow();
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          mainWindow.contentView.removeChildView(this.view);
        } catch {
          // Ignore
        }
      }
      try {
        if (!this.view.webContents.isDestroyed()) {
          this.view.webContents.close();
        }
      } catch {
        // Ignore
      }
      this.view = null;
    }

    if (resetState) {
      this.currentRunId = null;
      this.state = { ...INITIAL_BROWSER_STATE };
      this.emitState();
    }

    return { success: true };
  }

  public goBack(): OperationResult {
    if (this.view && !this.view.webContents.isDestroyed() && this.view.webContents.canGoBack()) {
      this.view.webContents.goBack();
      return { success: true };
    }
    return { success: false, error: "Cannot go back" };
  }

  public goForward(): OperationResult {
    if (this.view && !this.view.webContents.isDestroyed() && this.view.webContents.canGoForward()) {
      this.view.webContents.goForward();
      return { success: true };
    }
    return { success: false, error: "Cannot go forward" };
  }

  public reload(): OperationResult {
    if (this.view && !this.view.webContents.isDestroyed()) {
      this.view.webContents.reload();
      return { success: true };
    }
    return { success: false, error: "No active view to reload" };
  }

  public onDownloadDenied(url: string): void {
    this.state.blockedNavigationReason = "DOWNLOAD_DENIED";
    this.emitState();
  }
}
