import { ipcMain, IpcMainInvokeEvent } from "electron";
import {
  ApplicationBounds,
  DesktopCapabilities,
  DesktopRuntimeState,
  INITIAL_RUNTIME_STATE,
  IPC_CHANNELS,
  OpenApplicationParams,
  OperationResult,
} from "../shared/contracts";
import { fetchApplicationRun, isValidUuid } from "./api-client";
import { ApplicationViewManager } from "./application-view";
import { DesktopConfig } from "./config";
import type { RuntimeCoordinator } from "./runtime/coordinator";

export function isTrustedSender(
  event: IpcMainInvokeEvent,
  trustedOrigin: string
): boolean {
  if (!event.senderFrame) {
    return false;
  }
  try {
    const senderUrl = new URL(event.senderFrame.url);
    return senderUrl.origin === trustedOrigin;
  } catch {
    return false;
  }
}

export function registerIpcHandlers(
  viewManager: ApplicationViewManager,
  config: DesktopConfig,
  coordinator?: RuntimeCoordinator
): void {
  for (const channel of Object.values(IPC_CHANNELS)) {
    ipcMain.removeHandler(channel);
  }

  ipcMain.handle(
    IPC_CHANNELS.GET_CAPABILITIES,
    (event): DesktopCapabilities => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }
      return {
        embeddedBrowser: true,
        platform: process.platform,
        productionRuntime: coordinator !== undefined,
      };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GET_RUNTIME_STATE,
    (event): DesktopRuntimeState => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }
      return coordinator ? coordinator.getState() : { ...INITIAL_RUNTIME_STATE };
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.OPEN_APPLICATION,
    async (
      event,
      params: OpenApplicationParams
    ): Promise<OperationResult> => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }

      if (!params || typeof params.runId !== "string" || !isValidUuid(params.runId)) {
        return {
          success: false,
          error: "Invalid parameter: runId must be a valid UUID string",
        };
      }

      try {
        const run = await fetchApplicationRun(
          config.apiBaseUrl,
          params.runId,
          config.runnerSecret
        );

        if (coordinator) {
          return await coordinator.openRun(run.runId, run.applicationUrl);
        }
        return await viewManager.openApplication(run.runId, run.applicationUrl);
      } catch (err) {
        return {
          success: false,
          error: `Failed to resolve or open run: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.SET_BOUNDS,
    (event, bounds: ApplicationBounds): OperationResult => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }

      if (
        !bounds ||
        typeof bounds.x !== "number" ||
        typeof bounds.y !== "number" ||
        typeof bounds.width !== "number" ||
        typeof bounds.height !== "number"
      ) {
        return {
          success: false,
          error: "Invalid bounds: x, y, width, and height must be numbers",
        };
      }

      return viewManager.setApplicationBounds(bounds);
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.CLOSE_APPLICATION,
    (event): OperationResult | Promise<OperationResult> => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }
      if (coordinator) {
        return coordinator.closeActive();
      }
      return viewManager.closeApplication();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GO_BACK,
    (event): OperationResult => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }
      return viewManager.goBack();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.GO_FORWARD,
    (event): OperationResult => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }
      return viewManager.goForward();
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.RELOAD,
    (event): OperationResult => {
      if (!isTrustedSender(event, config.webOrigin)) {
        throw new Error("Unauthorized IPC sender: forbidden frame origin");
      }
      return viewManager.reload();
    }
  );
}
