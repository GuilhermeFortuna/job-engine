import { contextBridge, ipcRenderer } from "electron";
import type {
  ApplicationBounds,
  DesktopBrowserState,
  DesktopCapabilities,
  DesktopRuntimeState,
  JobEngineDesktopAPI,
  OpenApplicationParams,
  OperationResult,
} from "../shared/contracts";

/**
 * Channel names must stay byte-identical to `IPC_CHANNELS` in
 * `src/shared/contracts.ts`. Sandboxed preloads may only `require("electron")`,
 * so this file cannot import the shared module at runtime.
 */
const IPC_CHANNELS = {
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

const desktopApi: JobEngineDesktopAPI = {
  getCapabilities: (): Promise<DesktopCapabilities> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_CAPABILITIES);
  },

  openApplication: (params: OpenApplicationParams): Promise<OperationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.OPEN_APPLICATION, params);
  },

  setApplicationBounds: (bounds: ApplicationBounds): Promise<OperationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.SET_BOUNDS, bounds);
  },

  closeApplication: (): Promise<OperationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.CLOSE_APPLICATION);
  },

  goBack: (): Promise<OperationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GO_BACK);
  },

  goForward: (): Promise<OperationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GO_FORWARD);
  },

  reload: (): Promise<OperationResult> => {
    return ipcRenderer.invoke(IPC_CHANNELS.RELOAD);
  },

  getRuntimeState: (): Promise<DesktopRuntimeState> => {
    return ipcRenderer.invoke(IPC_CHANNELS.GET_RUNTIME_STATE);
  },

  subscribeBrowserState: (
    listener: (state: DesktopBrowserState) => void
  ): () => void => {
    const channelListener = (
      _event: Electron.IpcRendererEvent,
      state: DesktopBrowserState
    ) => {
      try {
        listener(state);
      } catch (err) {
        console.error("Error in browser state listener:", err);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.BROWSER_STATE_CHANGED, channelListener);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.BROWSER_STATE_CHANGED,
        channelListener
      );
    };
  },

  subscribeRuntimeState: (
    listener: (state: DesktopRuntimeState) => void
  ): () => void => {
    const channelListener = (
      _event: Electron.IpcRendererEvent,
      state: DesktopRuntimeState
    ) => {
      try {
        listener(state);
      } catch (err) {
        console.error("Error in runtime state listener:", err);
      }
    };

    ipcRenderer.on(IPC_CHANNELS.RUNTIME_STATE_CHANGED, channelListener);

    return () => {
      ipcRenderer.removeListener(
        IPC_CHANNELS.RUNTIME_STATE_CHANGED,
        channelListener
      );
    };
  },
};

contextBridge.exposeInMainWorld("jobEngineDesktop", desktopApi);
