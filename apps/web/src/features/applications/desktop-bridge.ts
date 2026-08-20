export interface DesktopCapabilities {
  embeddedBrowser: boolean;
  platform: string | null;
  productionRuntime: boolean;
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

export type RuntimePhase =
  | "idle"
  | "claiming"
  | "filling"
  | "armed"
  | "submitting"
  | "paused"
  | "queued"
  | "terminal";

export type RuntimeReasonCode =
  | "UNAUTHORIZED_FULL_AUTO"
  | "UNSUPPORTED_AUTOMATION_MODE"
  | "ADAPTER_UNAVAILABLE"
  | "STEP_EXHAUSTED"
  | "STEP_RETRYABLE"
  | "VIEW_LOCKED_SUBMITTING"
  | "URL_MISMATCH"
  | "CLAIM_REFUSED"
  | "LEASE_LOST"
  | "RENDERER_CRASHED"
  | "CAPTCHA_REQUIRED"
  | "AUTH_REQUIRED"
  | "NEEDS_INPUT"
  | "UNSUPPORTED_CONTROL"
  | "SUBMISSION_UNKNOWN"
  | null;

export interface DesktopRuntimeState {
  runId: string | null;
  phase: RuntimePhase;
  status: string | null;
  checkpoint: string | null;
  automationMode: string | null;
  adapterId: string | null;
  reasonCode: RuntimeReasonCode;
  blockingFieldCount: number;
}

export interface OperationResult {
  success: boolean;
  error?: string;
}

export interface JobEngineDesktopAPI {
  getCapabilities(): Promise<{
    embeddedBrowser: true;
    platform: string;
    productionRuntime: boolean;
  }>;
  openApplication(params: OpenApplicationParams): Promise<OperationResult>;
  setApplicationBounds(bounds: ApplicationBounds): Promise<OperationResult>;
  closeApplication(): Promise<OperationResult>;
  goBack(): Promise<OperationResult>;
  goForward(): Promise<OperationResult>;
  reload(): Promise<OperationResult>;
  getRuntimeState(): Promise<DesktopRuntimeState>;
  subscribeBrowserState(listener: (state: DesktopBrowserState) => void): () => void;
  subscribeRuntimeState(listener: (state: DesktopRuntimeState) => void): () => void;
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

export const INITIAL_RUNTIME_STATE: DesktopRuntimeState = {
  runId: null,
  phase: "idle",
  status: null,
  checkpoint: null,
  automationMode: null,
  adapterId: null,
  reasonCode: null,
  blockingFieldCount: 0,
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
    return {
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    };
  }
  try {
    const caps = await bridge.getCapabilities();
    return {
      embeddedBrowser: caps.embeddedBrowser === true,
      platform: caps.platform ?? null,
      productionRuntime: caps.productionRuntime === true,
    };
  } catch {
    return {
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    };
  }
}

export function isProductionRuntimeReady(
  capabilities: DesktopCapabilities,
): boolean {
  return capabilities.productionRuntime;
}

export async function getRuntimeState(): Promise<DesktopRuntimeState> {
  const bridge = getDesktopBridge();
  if (!bridge) {
    return INITIAL_RUNTIME_STATE;
  }
  try {
    return await bridge.getRuntimeState();
  } catch {
    return INITIAL_RUNTIME_STATE;
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

export function subscribeRuntimeState(
  listener: (state: DesktopRuntimeState) => void,
): () => void {
  const bridge = getDesktopBridge();
  if (!bridge || typeof bridge.subscribeRuntimeState !== "function") {
    return () => {};
  }
  try {
    return bridge.subscribeRuntimeState(listener);
  } catch {
    return () => {};
  }
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
