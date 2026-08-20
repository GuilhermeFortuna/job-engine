import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  fetchApplicationRuns,
  streamApplicationRunEvents,
} from "../api";
import type {
  ApplicationRunEvent,
  ApplicationRunList,
  ApplicationRunSummary,
} from "../types";
import { useApplicationRuns } from "./useApplicationRuns";

vi.mock("../api", () => ({
  fetchApplicationRuns: vi.fn(),
  streamApplicationRunEvents: vi.fn(),
}));

const emptyList: ApplicationRunList = {
  items: [],
  total: 0,
  page: 1,
  page_size: 25,
  total_pages: 1,
};

const event: ApplicationRunEvent = {
  id: "event-1",
  run_id: "run-1",
  attempt: 1,
  sequence_num: 1,
  event_type: "status_changed",
  created_at: "2026-08-20T00:00:00Z",
};

function run(id: string): ApplicationRunSummary {
  return {
    id,
    job_group_id: `job-${id}`,
    canonical_application_url: `https://example.test/${id}`,
    application_url: `https://example.test/${id}`,
    platform_adapter_id: "generic",
    resume_asset_id: "resume-1",
    resume_sha256: "ab".repeat(32),
    automation_mode: "full_auto",
    automatic_submission_authorized_at: "2026-08-20T00:00:00Z",
    automatic_submission_authorized: true,
    status: "running",
    current_step: null,
    current_checkpoint: null,
    submit_attempted_at: null,
    terminal_reason: null,
    receipt_summary: null,
    policy_snapshot: null,
    created_at: "2026-08-20T00:00:00Z",
    updated_at: "2026-08-20T00:00:00Z",
    started_at: null,
    completed_at: null,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {};
  let reject: (reason: unknown) => void = () => {};
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

describe("useApplicationRuns", () => {
  beforeEach(() => {
    vi.mocked(fetchApplicationRuns).mockReset();
    vi.mocked(streamApplicationRunEvents).mockReset();
  });

  it("fetches the durable list and refreshes it from global state-changing events", async () => {
    const refreshedList = { ...emptyList, total: 1 };
    vi.mocked(fetchApplicationRuns)
      .mockResolvedValueOnce(emptyList)
      .mockResolvedValueOnce(refreshedList);
    let streamOptions:
      | Parameters<typeof streamApplicationRunEvents>[0]
      | undefined;
    vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
      streamOptions = options;
      options.onConnected?.();
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(undefined));
      });
    });

    const { result, unmount } = renderHook(() => useApplicationRuns());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(streamOptions?.runId).toBeUndefined();
    expect(result.current.connectionState).toBe("connected");

    await act(async () => {
      streamOptions?.onStateChanging?.(event);
    });
    await waitFor(() => expect(result.current.runs?.total).toBe(1));
    expect(fetchApplicationRuns).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("surfaces an SSE disconnect as degraded and stale", async () => {
    vi.mocked(fetchApplicationRuns).mockResolvedValue(emptyList);
    vi.mocked(streamApplicationRunEvents).mockRejectedValueOnce(
      new Error("stream disconnected"),
    );

    const { result, unmount } = renderHook(() => useApplicationRuns());

    await waitFor(() =>
      expect(result.current.connectionState).toBe("degraded"),
    );
    expect(result.current.isStale).toBe(true);
    expect(result.current.streamError).toBe("stream disconnected");
    unmount();
  });

  it("exposes a manual durable refresh without replacing list truth", async () => {
    vi.mocked(fetchApplicationRuns).mockResolvedValue(emptyList);
    vi.mocked(streamApplicationRunEvents).mockImplementation(
      (options) => {
        options.onConnected?.();
        return new Promise((resolve) => {
          options.signal?.addEventListener("abort", () => resolve(undefined));
        });
      },
    );

    const { result, unmount } = renderHook(() => useApplicationRuns());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.refresh();
    });
    expect(fetchApplicationRuns).toHaveBeenCalledTimes(2);
    unmount();
  });

  it("refuses page loading during an active refresh without stranding loading", async () => {
    const refreshing = deferred<ApplicationRunList>();
    vi.mocked(fetchApplicationRuns)
      .mockResolvedValueOnce({
        items: [run("run-1")],
        total: 2,
        page: 1,
        page_size: 1,
        total_pages: 2,
      })
      .mockReturnValueOnce(refreshing.promise);
    vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
      options.onConnected?.();
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(undefined));
      });
    });

    const { result, unmount } = renderHook(() => useApplicationRuns());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let refreshPromise: Promise<void> | undefined;
    act(() => {
      refreshPromise = result.current.refresh();
      void result.current.loadMore();
    });

    expect(fetchApplicationRuns).toHaveBeenCalledTimes(2);
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.isLoading).toBe(true);

    await act(async () => {
      refreshing.resolve({
        items: [run("run-fresh")],
        total: 1,
        page: 1,
        page_size: 1,
        total_pages: 1,
      });
      await refreshPromise;
    });

    expect(result.current.isLoading).toBe(false);
    expect(result.current.runs?.items[0]?.id).toBe("run-fresh");
    unmount();
  });

  it("loads a second page, deduplicates runs, and reports visible totals", async () => {
    const secondPage = deferred<ApplicationRunList>();
    vi.mocked(fetchApplicationRuns)
      .mockResolvedValueOnce({
        items: [run("run-1"), run("run-2")],
        total: 3,
        page: 1,
        page_size: 2,
        total_pages: 2,
      })
      .mockReturnValueOnce(secondPage.promise);
    vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
      options.onConnected?.();
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(undefined));
      });
    });

    const { result, unmount } = renderHook(() => useApplicationRuns());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    let loadPromise: Promise<void> | undefined;
    act(() => {
      loadPromise = result.current.loadMore();
    });
    expect(result.current.isLoadingMore).toBe(true);

    await act(async () => {
      secondPage.resolve({
        items: [run("run-2"), run("run-3")],
        total: 3,
        page: 2,
        page_size: 2,
        total_pages: 2,
      });
      await loadPromise;
    });

    expect(fetchApplicationRuns).toHaveBeenLastCalledWith(
      { page: 2, page_size: 2 },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(result.current.runs?.items.map((item) => item.id)).toEqual([
      "run-1",
      "run-2",
      "run-3",
    ]);
    expect(result.current.runs?.total).toBe(3);
    expect(result.current.hasMore).toBe(false);
    unmount();
  });

  it("preserves loaded runs and exposes a safe second-page error", async () => {
    vi.mocked(fetchApplicationRuns)
      .mockResolvedValueOnce({
        items: [run("run-1")],
        total: 2,
        page: 1,
        page_size: 1,
        total_pages: 2,
      })
      .mockRejectedValueOnce(new Error("private page failure"));
    vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
      options.onConnected?.();
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(undefined));
      });
    });

    const { result, unmount } = renderHook(() => useApplicationRuns());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.runs?.items.map((item) => item.id)).toEqual(["run-1"]);
    expect(result.current.loadMoreError).toBe("Unable to load more application runs");
    expect(result.current.isLoadingMore).toBe(false);
    unmount();
  });

  it("lets SSE refresh replace loaded pages and ignores an older page response", async () => {
    const secondPage = deferred<ApplicationRunList>();
    const refreshed = {
      items: [run("run-fresh")],
      total: 1,
      page: 1,
      page_size: 1,
      total_pages: 1,
    };
    vi.mocked(fetchApplicationRuns)
      .mockResolvedValueOnce({
        items: [run("run-1")],
        total: 2,
        page: 1,
        page_size: 1,
        total_pages: 2,
      })
      .mockReturnValueOnce(secondPage.promise)
      .mockResolvedValueOnce(refreshed);
    let streamOptions:
      | Parameters<typeof streamApplicationRunEvents>[0]
      | undefined;
    vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
      streamOptions = options;
      options.onConnected?.();
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(undefined));
      });
    });

    const { result, unmount } = renderHook(() => useApplicationRuns());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    act(() => {
      void result.current.loadMore();
      streamOptions?.onStateChanging?.(event);
    });
    await waitFor(() =>
      expect(result.current.runs?.items[0]?.id).toBe("run-fresh"),
    );

    await act(async () => {
      secondPage.resolve({
        items: [run("run-stale")],
        total: 2,
        page: 2,
        page_size: 1,
        total_pages: 2,
      });
    });
    expect(result.current.runs?.items.map((item) => item.id)).toEqual([
      "run-fresh",
    ]);
    expect(result.current.hasMore).toBe(false);
    unmount();
  });

  it("keeps the newest durable list across out-of-order initial, manual, and SSE refreshes", async () => {
    const initial = deferred<ApplicationRunList>();
    const manual = deferred<ApplicationRunList>();
    const sse = deferred<ApplicationRunList>();
    vi.mocked(fetchApplicationRuns)
      .mockReturnValueOnce(initial.promise)
      .mockReturnValueOnce(manual.promise)
      .mockReturnValueOnce(sse.promise);
    let streamOptions:
      | Parameters<typeof streamApplicationRunEvents>[0]
      | undefined;
    vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
      streamOptions = options;
      options.onConnected?.();
      return new Promise((resolve) => {
        options.signal?.addEventListener("abort", () => resolve(undefined));
      });
    });

    const { result, unmount } = renderHook(() => useApplicationRuns());
    await waitFor(() => expect(streamOptions).toBeDefined());

    let manualPromise: Promise<void> | undefined;
    act(() => {
      manualPromise = result.current.refresh();
      streamOptions?.onStateChanging?.(event);
    });

    await act(async () => {
      sse.resolve({ ...emptyList, total: 3 });
    });
    await waitFor(() => expect(result.current.runs?.total).toBe(3));

    await act(async () => {
      manual.resolve({ ...emptyList, total: 2 });
      await manualPromise;
      initial.resolve({ ...emptyList, total: 1 });
    });
    expect(result.current.runs?.total).toBe(3);
    unmount();
  });

  it("keeps reconnecting health stale until the resumed stream establishes", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchApplicationRuns).mockResolvedValue(emptyList);
      const streamCalls: Array<
        Parameters<typeof streamApplicationRunEvents>[0]
      > = [];
      vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
        streamCalls.push(options);
        if (streamCalls.length === 1) {
          options.onConnected?.();
          return Promise.resolve("run-1:4");
        }
        return new Promise((resolve) => {
          options.signal?.addEventListener("abort", () => resolve("run-1:4"));
        });
      });

      const { result, unmount } = renderHook(() => useApplicationRuns());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.connectionState).toBe("degraded");
      expect(result.current.isStale).toBe(true);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });
      expect(streamCalls).toHaveLength(2);
      expect(streamCalls[1].lastEventId).toBe("run-1:4");
      expect(result.current.connectionState).toBe("connecting");
      expect(result.current.isStale).toBe(true);

      act(() => {
        streamCalls[1].onConnected?.();
      });
      expect(result.current.connectionState).toBe("connected");
      expect(result.current.isStale).toBe(false);
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reconnects from cursor progress retained before a stream rejection", async () => {
    vi.useFakeTimers();
    try {
      vi.mocked(fetchApplicationRuns).mockResolvedValue(emptyList);
      const streamCalls: Array<
        Parameters<typeof streamApplicationRunEvents>[0]
      > = [];
      vi.mocked(streamApplicationRunEvents).mockImplementation((options) => {
        streamCalls.push(options);
        if (streamCalls.length === 1) {
          options.onConnected?.();
          options.onStateChanging?.(event);
          options.onLastEventId?.("run-1:9");
          return Promise.reject(new Error("reader failed after event"));
        }
        return new Promise((resolve) => {
          options.signal?.addEventListener("abort", () => resolve("run-1:9"));
        });
      });

      const { result, unmount } = renderHook(() => useApplicationRuns());
      await act(async () => {
        await Promise.resolve();
        await Promise.resolve();
      });
      expect(result.current.connectionState).toBe("degraded");

      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_500);
      });
      expect(streamCalls).toHaveLength(2);
      expect(streamCalls[1].lastEventId).toBe("run-1:9");
      expect(result.current.connectionState).toBe("connecting");
      unmount();
    } finally {
      vi.useRealTimers();
    }
  });
});
