import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeApplicationView,
  getCapabilities,
  getDesktopBridge,
  getRuntimeState,
  goBack,
  goForward,
  isProductionRuntimeReady,
  measureViewportBounds,
  openApplicationView,
  reloadApplicationView,
  setApplicationBounds,
  subscribeBrowserState,
  subscribeRuntimeState,
} from "./desktop-bridge";
import type { JobEngineDesktopAPI } from "./desktop-bridge";

function mockBridge(overrides: Partial<JobEngineDesktopAPI> = {}): JobEngineDesktopAPI {
  return {
    getCapabilities: vi.fn().mockResolvedValue({
      embeddedBrowser: true,
      platform: "linux",
      productionRuntime: true,
    }),
    openApplication: vi.fn().mockResolvedValue({ success: true }),
    setApplicationBounds: vi.fn().mockResolvedValue({ success: true }),
    closeApplication: vi.fn().mockResolvedValue({ success: true }),
    goBack: vi.fn().mockResolvedValue({ success: true }),
    goForward: vi.fn().mockResolvedValue({ success: true }),
    reload: vi.fn().mockResolvedValue({ success: true }),
    getRuntimeState: vi.fn().mockResolvedValue({
      runId: null,
      phase: "idle",
      status: null,
      checkpoint: null,
      automationMode: null,
      adapterId: null,
      reasonCode: null,
      blockingFieldCount: 0,
    }),
    subscribeBrowserState: vi.fn().mockReturnValue(() => {}),
    subscribeRuntimeState: vi.fn().mockReturnValue(() => {}),
    ...overrides,
  };
}

describe("desktop bridge", () => {
  afterEach(() => {
    delete (window as Window & { jobEngineDesktop?: JobEngineDesktopAPI }).jobEngineDesktop;
    vi.restoreAllMocks();
  });

  it("returns a missing-bridge fallback when Electron is not present", async () => {
    expect(getDesktopBridge()).toBeNull();
    await expect(getCapabilities()).resolves.toEqual({
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    });
    await expect(openApplicationView("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa")).resolves.toEqual({
      success: false,
      error: "Desktop bridge unavailable",
    });
    await expect(setApplicationBounds({ x: 0, y: 0, width: 800, height: 600 })).resolves.toEqual({
      success: false,
      error: "Desktop bridge unavailable",
    });
    expect(subscribeBrowserState(() => {})).toEqual(expect.any(Function));
    await expect(getRuntimeState()).resolves.toMatchObject({
      phase: "idle",
      reasonCode: null,
    });
    expect(subscribeRuntimeState(() => {})).toEqual(expect.any(Function));
  });

  it("exposes capabilities only through the typed window bridge", async () => {
    window.jobEngineDesktop = mockBridge();
    await expect(getCapabilities()).resolves.toEqual({
      embeddedBrowser: true,
      platform: "linux",
      productionRuntime: true,
    });
    expect(window.jobEngineDesktop.getCapabilities).toHaveBeenCalledTimes(1);
  });

  it("requires the production runtime capability for automation readiness", () => {
    expect(
      isProductionRuntimeReady({
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: false,
      }),
    ).toBe(false);
    expect(
      isProductionRuntimeReady({
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: true,
      }),
    ).toBe(true);
  });

  it("gets and subscribes to the redacted CROSS-012 runtime state", async () => {
    const state = {
      runId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
      phase: "paused" as const,
      status: "needs_input",
      checkpoint: "questions_answered",
      automationMode: "full_auto",
      adapterId: "greenhouse",
      reasonCode: "NEEDS_INPUT" as const,
      blockingFieldCount: 2,
    };
    const listener = vi.fn();
    const unsubscribe = vi.fn();
    const bridge = mockBridge({
      getRuntimeState: vi.fn().mockResolvedValue(state),
      subscribeRuntimeState: vi.fn().mockImplementation((callback) => {
        callback(state);
        return unsubscribe;
      }),
    });
    window.jobEngineDesktop = bridge;

    await expect(getRuntimeState()).resolves.toEqual(state);
    const stop = subscribeRuntimeState(listener);

    expect(listener).toHaveBeenCalledWith(state);
    stop();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it("returns a no-op subscription for incomplete or throwing bridges", () => {
    window.jobEngineDesktop = {} as JobEngineDesktopAPI;
    const missingStop = subscribeRuntimeState(() => {});
    expect(missingStop).toEqual(expect.any(Function));
    expect(() => missingStop()).not.toThrow();

    window.jobEngineDesktop = {
      subscribeRuntimeState: vi.fn(() => {
        throw new Error("preload disconnected");
      }),
    } as unknown as JobEngineDesktopAPI;
    const throwingStop = subscribeRuntimeState(() => {});
    expect(throwingStop).toEqual(expect.any(Function));
    expect(() => throwingStop()).not.toThrow();
  });

  it("opens by run ID only after bounds are reported", async () => {
    const bridge = mockBridge();
    window.jobEngineDesktop = bridge;
    const runId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
    const order: string[] = [];
    bridge.subscribeBrowserState = vi.fn().mockImplementation(() => {
      order.push("subscribe");
      return () => {};
    });
    bridge.setApplicationBounds = vi.fn().mockImplementation(async () => {
      order.push("bounds");
      return { success: true };
    });
    bridge.openApplication = vi.fn().mockImplementation(async (params) => {
      order.push("open");
      expect(params).toEqual({ runId });
      expect(params).not.toHaveProperty("url");
      return { success: true };
    });

    const unsubscribe = subscribeBrowserState(() => {});
    await setApplicationBounds({
      x: 320,
      y: 80,
      width: 640,
      height: 560,
      devicePixelRatio: 2,
    });
    await openApplicationView(runId);

    expect(order).toEqual(["subscribe", "bounds", "open"]);
    expect(bridge.openApplication).toHaveBeenCalledWith({ runId });
    unsubscribe();
  });

  it("closes the native view and forwards toolbar actions", async () => {
    const bridge = mockBridge();
    window.jobEngineDesktop = bridge;
    await closeApplicationView();
    await goBack();
    await goForward();
    await reloadApplicationView();
    expect(bridge.closeApplication).toHaveBeenCalledTimes(1);
    expect(bridge.goBack).toHaveBeenCalledTimes(1);
    expect(bridge.goForward).toHaveBeenCalledTimes(1);
    expect(bridge.reload).toHaveBeenCalledTimes(1);
  });

  it("measures CSS bounds from a layout rectangle including devicePixelRatio", () => {
    const element = document.createElement("div");
    element.getBoundingClientRect = () =>
      ({
        x: 10.4,
        y: 20.6,
        width: 800.2,
        height: 500.8,
        top: 20.6,
        left: 10.4,
        bottom: 521.4,
        right: 810.6,
        toJSON() {
          return {};
        },
      }) as DOMRect;
    Object.defineProperty(window, "devicePixelRatio", { configurable: true, value: 1.5 });
    expect(measureViewportBounds(element)).toEqual({
      x: 10.4,
      y: 20.6,
      width: 800.2,
      height: 500.8,
      devicePixelRatio: 1.5,
    });
  });
});
