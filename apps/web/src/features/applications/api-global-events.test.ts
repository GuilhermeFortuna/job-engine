import { afterEach, describe, expect, it, vi } from "vitest";
import { streamApplicationRunEvents } from "./api";

describe("global application run events", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the global endpoint and accepts events from every run", async () => {
    const payload = `id: run-2:4\nevent: status_changed\ndata: ${JSON.stringify({
      id: "event-4",
      run_id: "run-2",
      attempt: 1,
      sequence_num: 4,
      event_type: "status_changed",
      created_at: "2026-08-20T00:00:00Z",
    })}\n\n`;
    const response = new Response(payload, {
      status: 200,
      headers: { "Content-Type": "text/event-stream" },
    });
    const mockFetch = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", mockFetch);
    const onEvent = vi.fn();
    const onConnected = vi.fn();

    const lastEventId = await streamApplicationRunEvents({
      onConnected,
      onEvent,
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "http://127.0.0.1:8001/api/v1/application-runs/events/stream",
      expect.objectContaining({
        headers: { Accept: "text/event-stream" },
      }),
    );
    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: "run-2" }),
    );
    expect(onConnected).toHaveBeenCalledOnce();
    expect(lastEventId).toBe("run-2:4");
  });

  it("reports cursor progress before a later reader failure", async () => {
    const payload = `id: run-3:7\nevent: status_changed\ndata: ${JSON.stringify({
      id: "event-7",
      run_id: "run-3",
      attempt: 1,
      sequence_num: 7,
      event_type: "status_changed",
      created_at: "2026-08-20T00:00:00Z",
    })}\n\n`;
    const read = vi
      .fn()
      .mockResolvedValueOnce({
        done: false,
        value: new TextEncoder().encode(payload),
      })
      .mockRejectedValueOnce(new Error("reader failed"));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        body: { getReader: () => ({ read }) },
      }),
    );
    const onEvent = vi.fn();
    const onLastEventId = vi.fn();

    await expect(
      streamApplicationRunEvents({ onEvent, onLastEventId }),
    ).rejects.toThrow("SSE streaming connection interrupted");

    expect(onEvent).toHaveBeenCalledWith(
      expect.objectContaining({ run_id: "run-3", sequence_num: 7 }),
    );
    expect(onLastEventId).toHaveBeenCalledWith("run-3:7");
  });
});
