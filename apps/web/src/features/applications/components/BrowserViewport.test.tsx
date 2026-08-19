import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/render";
import { BrowserViewport } from "./BrowserViewport";
import {
  MIN_WORKSPACE_HEIGHT,
  MIN_WORKSPACE_WIDTH,
  type ApplicationBounds,
} from "../desktop-bridge";

describe("BrowserViewport", () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  afterEach(() => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: originalInnerHeight,
    });
    vi.restoreAllMocks();
  });

  it("reports measured bounds while the window is supported and stops when undersized", () => {
    const observed: Array<ApplicationBounds | null> = [];
    const supported: boolean[] = [];
    class ResizeObserverStub {
      callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback([] as unknown as ResizeObserverEntry[], this);
      }
      disconnect() {}
      unobserve() {}
    }
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 280,
      y: 96,
      width: 720,
      height: 520,
      top: 96,
      left: 280,
      bottom: 616,
      right: 1000,
      toJSON() {
        return {};
      },
    } as DOMRect);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: MIN_WORKSPACE_WIDTH,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: MIN_WORKSPACE_HEIGHT,
    });

    const view = renderWithProviders(
      <BrowserViewport
        onBounds={(bounds) => observed.push(bounds)}
        onSupportedChange={(value) => supported.push(value)}
      />,
    );

    expect(observed.at(-1)).toMatchObject({
      x: 280,
      y: 96,
      width: 720,
      height: 520,
    });
    expect(supported.at(-1)).toBe(true);

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    window.dispatchEvent(new Event("resize"));
    expect(observed.at(-1)).toBeNull();
    expect(supported.at(-1)).toBe(false);

    view.unmount();
  });
});
