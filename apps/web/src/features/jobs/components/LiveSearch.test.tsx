import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiCooldownError, streamLiveSync } from "../api";
import type { LiveSyncState } from "../types";
import { LiveSearchButton } from "./LiveSearchButton";
import { LiveSyncProgressModal } from "./LiveSyncProgressModal";

describe("LiveSearch", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_BASE_URL = "http://127.0.0.1:8000";
  });


describe("LiveSearchButton", () => {
  it("renders idle state with accessible label", () => {
    const onStartSync = vi.fn();
    render(
      <LiveSearchButton
        onStartSync={onStartSync}
        status="idle"
        cooldownSeconds={null}
      />,
    );

    const btn = screen.getByRole("button", { name: /trigger live search/i });
    expect(btn).toBeInTheDocument();
    expect(btn).toHaveTextContent("Live Search");

    fireEvent.click(btn);
    expect(onStartSync).toHaveBeenCalledTimes(1);
  });

  it("renders syncing state with busy attribute and spinning text", () => {
    render(
      <LiveSearchButton
        onStartSync={vi.fn()}
        status="syncing"
        cooldownSeconds={null}
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn).toHaveAttribute("aria-busy", "true");
    expect(btn).toHaveTextContent("Syncing...");
    expect(btn).toBeDisabled();
  });

  it("renders cooldown state with remaining seconds", () => {
    render(
      <LiveSearchButton
        onStartSync={vi.fn()}
        status="cooldown"
        cooldownSeconds={18}
      />,
    );

    const btn = screen.getByRole("button");
    expect(btn).toHaveTextContent("Live Sync (18s)");
    expect(btn).toBeDisabled();
  });
});

describe("LiveSyncProgressModal", () => {
  const mockState: LiveSyncState = {
    status: "syncing",
    sources: {
      himalayas: {
        source_id: "himalayas",
        stage: "fetching",
        fetched_count: 20,
        accepted_count: 18,
        rejected_count: 2,
        inserted_count: 0,
        updated_count: 0,
        marked_stale_count: 0,
        error_summaries: [],
      },
      jobicy: {
        source_id: "jobicy",
        stage: "persisting",
        status: "success",
        fetched_count: 30,
        accepted_count: 30,
        rejected_count: 0,
        inserted_count: 5,
        updated_count: 25,
        marked_stale_count: 0,
        error_summaries: [],
      },
      remoteok: {
        source_id: "remoteok",
        stage: "persisting",
        status: "failure",
        fetched_count: 0,
        accepted_count: 0,
        rejected_count: 0,
        inserted_count: 0,
        updated_count: 0,
        marked_stale_count: 0,
        error_summaries: [{ code: "upstream_timeout", message: "Remote OK API timeout" }],
      },
    },
    total_inserted: 5,
    total_updated: 25,
    total_stale: 0,
    started_at: "2026-08-17T02:00:00Z",
    completed_at: null,
    error_message: null,
    cooldown_remaining_seconds: null,
  };

  it("does not render when isOpen is false", () => {
    const { container } = render(
      <LiveSyncProgressModal
        isOpen={false}
        state={mockState}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders progress modal with sources and badges when open", () => {
    render(
      <LiveSyncProgressModal
        isOpen={true}
        state={mockState}
        onClose={vi.fn()}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
        liveAnnouncement="Live sync in progress..."
      />,
    );

    expect(screen.getByRole("dialog", { name: /live catalog synchronization/i })).toBeInTheDocument();
    expect(screen.getByText("Himalayas")).toBeInTheDocument();
    expect(screen.getByText("Jobicy")).toBeInTheDocument();
    expect(screen.getByText("Remote OK")).toBeInTheDocument();

    // Source badges
    expect(screen.getByText("Fetching")).toBeInTheDocument();
    expect(screen.getByText("✓ Done")).toBeInTheDocument();
    expect(screen.getByText("✕ Failed")).toBeInTheDocument();

    // Live region
    const liveRegion = screen.getByTestId("live-sync-announcement");
    expect(liveRegion).toHaveTextContent("Live sync in progress...");
  });

  it("invokes onClose when Escape key is pressed", () => {
    const onClose = vi.fn();
    render(
      <LiveSyncProgressModal
        isOpen={true}
        state={mockState}
        onClose={onClose}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("invokes onClose when Close/Dismiss button is clicked", () => {
    const onClose = vi.fn();
    render(
      <LiveSyncProgressModal
        isOpen={true}
        state={mockState}
        onClose={onClose}
        onCancel={vi.fn()}
        onRetry={vi.fn()}
      />,
    );

    const dismissBtn = screen.getByRole("button", { name: /run in background/i });
    fireEvent.click(dismissBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("streamLiveSync SSE Client", () => {
  it("parses SSE chunks and dispatches typed callbacks", async () => {
    const ssePayload = [
      'event: sync_started\ndata: {"sources":["himalayas","jobicy"],"started_at":"2026-08-17T02:00:00Z"}\n\n',
      'event: source_progress\ndata: {"source_id":"himalayas","stage":"fetching","fetched_count":10,"accepted_count":10,"rejected_count":0}\n\n',
      'event: source_completed\ndata: {"source_id":"himalayas","status":"success","inserted_count":2,"updated_count":8,"marked_stale_count":0,"error_summaries":[]}\n\n',
      'event: sync_completed\ndata: {"status":"success","total_inserted":2,"total_updated":8,"total_stale":0,"completed_at":"2026-08-17T02:00:01Z"}\n\n',
    ].join("");

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(ssePayload));
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "Content-Type": "text/event-stream" }),
      body: stream,
    });
    vi.stubGlobal("fetch", mockFetch);

    const onStarted = vi.fn();
    const onSourceProgress = vi.fn();
    const onSourceCompleted = vi.fn();
    const onCompleted = vi.fn();

    await streamLiveSync({
      onStarted,
      onSourceProgress,
      onSourceCompleted,
      onCompleted,
    });

    expect(onStarted).toHaveBeenCalledWith({
      sources: ["himalayas", "jobicy"],
      started_at: "2026-08-17T02:00:00Z",
    });
    expect(onSourceProgress).toHaveBeenCalledWith({
      source_id: "himalayas",
      stage: "fetching",
      fetched_count: 10,
      accepted_count: 10,
      rejected_count: 0,
    });
    expect(onSourceCompleted).toHaveBeenCalledWith({
      source_id: "himalayas",
      status: "success",
      inserted_count: 2,
      updated_count: 8,
      marked_stale_count: 0,
      error_summaries: [],
    });
    expect(onCompleted).toHaveBeenCalledWith({
      status: "success",
      total_inserted: 2,
      total_updated: 8,
      total_stale: 0,
      completed_at: "2026-08-17T02:00:01Z",
    });

    vi.unstubAllGlobals();
  });

  it("handles HTTP 429 response and throws ApiCooldownError", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
      headers: new Headers({ "Retry-After": "25" }),
      json: async () => ({ detail: "Cooldown active" }),
    });
    vi.stubGlobal("fetch", mockFetch);

    const onError = vi.fn();

    await expect(
      streamLiveSync({
        onError,
      }),
    ).rejects.toThrow(ApiCooldownError);

    expect(onError).toHaveBeenCalledWith(expect.any(ApiCooldownError));
    const errorInstance = onError.mock.calls[0][0] as ApiCooldownError;
    expect(errorInstance.retryAfterSeconds).toBe(25);

    vi.unstubAllGlobals();
  });
});
});

