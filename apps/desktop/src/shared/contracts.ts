export interface DesktopCapabilities {
  embeddedBrowser: true;
  platform: string;
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
  getCapabilities(): Promise<DesktopCapabilities>;
  openApplication(params: OpenApplicationParams): Promise<OperationResult>;
  setApplicationBounds(bounds: ApplicationBounds): Promise<OperationResult>;
  closeApplication(): Promise<OperationResult>;
  goBack(): Promise<OperationResult>;
  goForward(): Promise<OperationResult>;
  reload(): Promise<OperationResult>;
  getRuntimeState(): Promise<DesktopRuntimeState>;
  subscribeBrowserState(
    listener: (state: DesktopBrowserState) => void
  ): () => void;
  subscribeRuntimeState(
    listener: (state: DesktopRuntimeState) => void
  ): () => void;
}

export const IPC_CHANNELS = {
  GET_CAPABILITIES: "job-engine:desktop:get-capabilities",
  OPEN_APPLICATION: "job-engine:desktop:open-application",
  SET_BOUNDS: "job-engine:desktop:set-bounds",
  CLOSE_APPLICATION: "job-engine:desktop:close-application",
  GO_BACK: "job-engine:desktop:go-back",
  GO_FORWARD: "job-engine:desktop:go-forward",
  RELOAD: "job-engine:desktop:reload",
  BROWSER_STATE_CHANGED: "job-engine:desktop:browser-state-changed",
  GET_RUNTIME_STATE: "job-engine:desktop:get-runtime-state",
  RUNTIME_STATE_CHANGED: "job-engine:desktop:runtime-state-changed",
} as const;

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

declare global {
  interface Window {
    jobEngineDesktop?: JobEngineDesktopAPI;
  }
}
