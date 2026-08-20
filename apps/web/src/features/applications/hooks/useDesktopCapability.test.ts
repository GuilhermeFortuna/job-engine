import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCapabilities } from "../desktop-bridge";
import { useDesktopCapability } from "./useDesktopCapability";

vi.mock("../desktop-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../desktop-bridge")>();
  return {
    ...actual,
    getCapabilities: vi.fn(),
  };
});

describe("useDesktopCapability", () => {
  beforeEach(() => {
    vi.mocked(getCapabilities).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("represents initial loading without claiming runtime unavailability", async () => {
    let resolveCapabilities!: (value: Awaited<ReturnType<typeof getCapabilities>>) => void;
    vi.mocked(getCapabilities).mockReturnValue(
      new Promise((resolve) => {
        resolveCapabilities = resolve;
      }),
    );

    const { result } = renderHook(() => useDesktopCapability());
    expect(result.current).toMatchObject({
      capabilities: null,
      isLoading: true,
    });

    await act(async () => {
      resolveCapabilities({
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: false,
      });
    });
    expect(result.current).toMatchObject({
      capabilities: {
        productionRuntime: false,
      },
      isLoading: false,
    });
  });

  it("rechecks an unavailable runtime and exposes later availability", async () => {
    vi.useFakeTimers();
    vi.mocked(getCapabilities)
      .mockResolvedValueOnce({
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: false,
      })
      .mockResolvedValueOnce({
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: true,
      });

    const { result } = renderHook(() => useDesktopCapability());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.capabilities?.productionRuntime).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_000);
    });
    expect(result.current.capabilities?.productionRuntime).toBe(true);
    expect(getCapabilities).toHaveBeenCalledTimes(2);
  });

  it("ignores stale responses and does not schedule obsolete retries", async () => {
    vi.useFakeTimers();
    let resolveInitial!: (
      value: Awaited<ReturnType<typeof getCapabilities>>,
    ) => void;
    let resolveFocused!: (
      value: Awaited<ReturnType<typeof getCapabilities>>,
    ) => void;
    vi.mocked(getCapabilities)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveInitial = resolve;
        }),
      )
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFocused = resolve;
        }),
      );

    const { result } = renderHook(() => useDesktopCapability());
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    await act(async () => {
      resolveFocused({
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: true,
      });
    });
    expect(result.current.capabilities?.productionRuntime).toBe(true);

    await act(async () => {
      resolveInitial({
        embeddedBrowser: false,
        platform: null,
        productionRuntime: false,
      });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(10_000);
    });
    expect(result.current.capabilities?.productionRuntime).toBe(true);
    expect(getCapabilities).toHaveBeenCalledTimes(2);
  });

  it("cleans up bounded retry and focus rechecks on unmount", async () => {
    vi.useFakeTimers();
    vi.mocked(getCapabilities).mockResolvedValue({
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    });

    const { result, unmount } = renderHook(() => useDesktopCapability());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.isLoading).toBe(false);
    expect(getCapabilities).toHaveBeenCalledTimes(1);
    unmount();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000);
      window.dispatchEvent(new Event("focus"));
      await Promise.resolve();
    });
    expect(getCapabilities).toHaveBeenCalledTimes(1);
  });
});
