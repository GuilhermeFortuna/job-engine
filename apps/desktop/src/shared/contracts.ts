export interface DesktopCapabilities {
  embeddedBrowser: true;
  platform: string;
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
  getCapabilities(): Promise<DesktopCapabilities>;
  openApplication(params: OpenApplicationParams): Promise<OperationResult>;
  setApplicationBounds(bounds: ApplicationBounds): Promise<OperationResult>;
  closeApplication(): Promise<OperationResult>;
  goBack(): Promise<OperationResult>;
  goForward(): Promise<OperationResult>;
  reload(): Promise<OperationResult>;
  subscribeBrowserState(
    listener: (state: DesktopBrowserState) => void
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

declare global {
  interface Window {
    jobEngineDesktop?: JobEngineDesktopAPI;
  }
}
