import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closeApplicationView,
  getCapabilities,
  getDesktopBridge,
  goBack,
  goForward,
  measureViewportBounds,
  openApplicationView,
  reloadApplicationView,
  setApplicationBounds,
  subscribeBrowserState,
} from "./desktop-bridge";
import type { JobEngineDesktopAPI } from "./desktop-bridge";

function mockBridge(overrides: Partial<JobEngineDesktopAPI> = {}): JobEngineDesktopAPI {
  return {
    getCapabilities: vi.fn().mockResolvedValue({
      embeddedBrowser: true,
      platform: "linux",
    }),
    openApplication: vi.fn().mockResolvedValue({ success: true }),
    setApplicationBounds: vi.fn().mockResolvedValue({ success: true }),
    closeApplication: vi.fn().mockResolvedValue({ success: true }),
    goBack: vi.fn().mockResolvedValue({ success: true }),
    goForward: vi.fn().mockResolvedValue({ success: true }),
    reload: vi.fn().mockResolvedValue({ success: true }),
    subscribeBrowserState: vi.fn().mockReturnValue(() => {}),
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
  });

  it("exposes capabilities only through the typed window bridge", async () => {
    window.jobEngineDesktop = mockBridge();
    await expect(getCapabilities()).resolves.toEqual({
      embeddedBrowser: true,
      platform: "linux",
    });
    expect(window.jobEngineDesktop.getCapabilities).toHaveBeenCalledTimes(1);
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
