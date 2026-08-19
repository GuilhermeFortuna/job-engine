import { contextBridge, ipcRenderer } from "electron";
import {
  ApplicationBounds,
  DesktopBrowserState,
  DesktopCapabilities,
  IPC_CHANNELS,
  JobEngineDesktopAPI,
  OpenApplicationParams,
  OperationResult,
} from "../shared/contracts";

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
};

contextBridge.exposeInMainWorld("jobEngineDesktop", desktopApi);
