import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getRuntimeState,
  subscribeRuntimeState,
  type DesktopRuntimeState,
} from "../desktop-bridge";
import {
  useApplicationRuntime,
  useApplicationRuntimeSnapshot,
} from "./useApplicationRuntime";

vi.mock("../desktop-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../desktop-bridge")>();
  return {
    ...actual,
    getRuntimeState: vi.fn(),
    subscribeRuntimeState: vi.fn(),
  };
});

const matchingState: DesktopRuntimeState = {
  runId: "run-1",
  phase: "filling",
  status: "running",
  checkpoint: "profile_filled",
  automationMode: "full_auto",
  adapterId: "generic",
  reasonCode: null,
  blockingFieldCount: 0,
};

describe("useApplicationRuntime", () => {
  beforeEach(() => {
    vi.mocked(getRuntimeState).mockReset();
    vi.mocked(subscribeRuntimeState).mockReset();
  });

  it("fetches and subscribes independently for each consumer", async () => {
    vi.mocked(getRuntimeState).mockResolvedValue(matchingState);
    const unsubscribers = [vi.fn(), vi.fn()];
    vi.mocked(subscribeRuntimeState)
      .mockReturnValueOnce(unsubscribers[0])
      .mockReturnValueOnce(unsubscribers[1]);

    const first = renderHook(() => useApplicationRuntime("run-1"));
    const second = renderHook(() => useApplicationRuntime("run-1"));

    await waitFor(() => expect(first.result.current.isLoading).toBe(false));
    await waitFor(() => expect(second.result.current.isLoading).toBe(false));
    expect(getRuntimeState).toHaveBeenCalledTimes(2);
    expect(subscribeRuntimeState).toHaveBeenCalledTimes(2);
    expect(first.result.current).toMatchObject({
      runtimeState: matchingState,
      viewAttached: true,
    });

    first.unmount();
    expect(unsubscribers[0]).toHaveBeenCalledOnce();
    expect(unsubscribers[1]).not.toHaveBeenCalled();
    second.unmount();
    expect(unsubscribers[1]).toHaveBeenCalledOnce();
  });

  it("provides one unfiltered snapshot subscription for a list boundary", async () => {
    vi.mocked(getRuntimeState).mockResolvedValue(matchingState);
    const unsubscribe = vi.fn();
    vi.mocked(subscribeRuntimeState).mockReturnValue(unsubscribe);

    const { result, unmount } = renderHook(() =>
      useApplicationRuntimeSnapshot(),
    );

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.runtimeState).toEqual(matchingState);
    expect(getRuntimeState).toHaveBeenCalledOnce();
    expect(subscribeRuntimeState).toHaveBeenCalledOnce();
    unmount();
    expect(unsubscribe).toHaveBeenCalledOnce();
  });

  it("rejects runtime snapshots for a different run", async () => {
    vi.mocked(getRuntimeState).mockResolvedValue({
      ...matchingState,
      runId: "another-run",
    });
    let listener: ((state: DesktopRuntimeState) => void) | undefined;
    vi.mocked(subscribeRuntimeState).mockImplementation((next) => {
      listener = next;
      return vi.fn();
    });

    const { result } = renderHook(() => useApplicationRuntime("run-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.runtimeState).toBeNull();

    act(() => listener?.(matchingState));
    expect(result.current.runtimeState).toEqual(matchingState);
    expect(result.current.viewAttached).toBe(true);

    act(() => listener?.({ ...matchingState, runId: "another-run" }));
    expect(result.current.runtimeState).toBeNull();
    expect(result.current.viewAttached).toBe(false);
  });

  it("does not let the initial fetch overwrite a newer subscription snapshot", async () => {
    let resolveInitial:
      | ((state: DesktopRuntimeState) => void)
      | undefined;
    vi.mocked(getRuntimeState).mockReturnValue(
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
    );
    const newerState = { ...matchingState, phase: "submitting" as const };
    vi.mocked(subscribeRuntimeState).mockImplementation((listener) => {
      listener(newerState);
      return vi.fn();
    });

    const { result } = renderHook(() => useApplicationRuntime("run-1"));
    await waitFor(() => expect(result.current.runtimeState).toEqual(newerState));

    await act(async () => {
      resolveInitial?.(matchingState);
    });
    await waitFor(() => expect(result.current.runtimeState).toEqual(newerState));
  });

  it("ignores an older initial-fetch rejection after a subscription snapshot", async () => {
    let rejectInitial: ((reason: Error) => void) | undefined;
    vi.mocked(getRuntimeState).mockReturnValue(
      new Promise((_, reject) => {
        rejectInitial = reject;
      }),
    );
    const newerState = { ...matchingState, phase: "submitting" as const };
    vi.mocked(subscribeRuntimeState).mockImplementation((listener) => {
      listener(newerState);
      return vi.fn();
    });

    const { result } = renderHook(() => useApplicationRuntime("run-1"));
    await waitFor(() => expect(result.current.runtimeState).toEqual(newerState));

    await act(async () => {
      rejectInitial?.(new Error("stale fetch failed"));
    });
    expect(result.current.runtimeState).toEqual(newerState);
    expect(result.current.error).toBeNull();
  });

  it("maps the current runtime bridge failure to fixed safe copy", async () => {
    vi.mocked(getRuntimeState).mockRejectedValue(
      new Error("IPC secret at /home/owner/resume.pdf"),
    );
    vi.mocked(subscribeRuntimeState).mockReturnValue(vi.fn());

    const { result } = renderHook(() => useApplicationRuntime("run-1"));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Unable to load runtime state.");
    expect(result.current.error).not.toMatch(/IPC|secret|\/home|resume/i);
  });
});
