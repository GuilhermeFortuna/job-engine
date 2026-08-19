export interface DesktopCapabilities {
  embeddedBrowser: boolean;
  platform: string | null;
}

export interface OpenApplicationParams {
  runId: string;
}

export interface ApplicationBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  devicePixelRatio?: number;
}

export type BlockedNavigationReason =
  | "NON_HTTPS_DENIED"
  | "UNAPPROVED_NAVIGATION"
  | "UNAPPROVED_POPUP"
  | "DOWNLOAD_DENIED"
  | "CRASHED"
  | "LOAD_FAILED"
  | "UNRESOLVED_RUN";

export interface DesktopBrowserState {
  runId: string | null;
  displayUrl: string;
  title: string;
  isLoading: boolean;
  canGoBack: boolean;
  canGoForward: boolean;
  blockedNavigationReason: BlockedNavigationReason | null;
}

export interface OperationResult {
  success: boolean;
  error?: string;
}

export interface JobEngineDesktopAPI {
  getCapabilities(): Promise<{ embeddedBrowser: true; platform: string }>;
  openApplication(params: OpenApplicationParams): Promise<OperationResult>;
  setApplicationBounds(bounds: ApplicationBounds): Promise<OperationResult>;
  closeApplication(): Promise<OperationResult>;
  goBack(): Promise<OperationResult>;
  goForward(): Promise<OperationResult>;
  reload(): Promise<OperationResult>;
  subscribeBrowserState(listener: (state: DesktopBrowserState) => void): () => void;
}

declare global {
  interface Window {
    jobEngineDesktop?: JobEngineDesktopAPI;
  }
}

export const MIN_WORKSPACE_WIDTH = 1280;
export const MIN_WORKSPACE_HEIGHT = 720;
export const UNAVAILABLE_RESULT: OperationResult = {
  success: false,
  error: "Desktop bridge unavailable",
};

export const INITIAL_BROWSER_STATE: DesktopBrowserState = {
  runId: null,
  displayUrl: "",
  title: "",
  isLoading: false,
  canGoBack: false,
  canGoForward: false,
  blockedNavigationReason: null,
};

export function getDesktopBridge(): JobEngineDesktopAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return window.jobEngineDesktop ?? null;
}

export async function getCapabilities(): Promise<DesktopCapabilities> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return { embeddedBrowser: false, platform: null };
  }
  try {
    const caps = await bridge.getCapabilities();
    return {
      embeddedBrowser: caps.embeddedBrowser === true,
      platform: caps.platform ?? null,
    };
  } catch {
    return { embeddedBrowser: false, platform: null };
  }
}

export function subscribeBrowserState(
  listener: (state: DesktopBrowserState) => void,
): () => void {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return () => {};
  }
  return bridge.subscribeBrowserState(listener);
}

export async function setApplicationBounds(
  bounds: ApplicationBounds,
): Promise<OperationResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return UNAVAILABLE_RESULT;
  }
  return bridge.setApplicationBounds(bounds);
}

export async function openApplicationView(runId: string): Promise<OperationResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return UNAVAILABLE_RESULT;
  }
  return bridge.openApplication({ runId });
}

export async function closeApplicationView(): Promise<OperationResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return UNAVAILABLE_RESULT;
  }
  return bridge.closeApplication();
}

export async function goBack(): Promise<OperationResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return UNAVAILABLE_RESULT;
  }
  return bridge.goBack();
}

export async function goForward(): Promise<OperationResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return UNAVAILABLE_RESULT;
  }
  return bridge.goForward();
}

export async function reloadApplicationView(): Promise<OperationResult> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return UNAVAILABLE_RESULT;
  }
  return bridge.reload();
}

export function measureViewportBounds(
  element: Pick<Element, "getBoundingClientRect">,
): ApplicationBounds {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    devicePixelRatio: typeof window === "undefined" ? 1 : window.devicePixelRatio,
  };
}

export function isSupportedWorkspaceSize(
  width: number,
  height: number,
): boolean {
  return width >= MIN_WORKSPACE_WIDTH && height >= MIN_WORKSPACE_HEIGHT;
}
