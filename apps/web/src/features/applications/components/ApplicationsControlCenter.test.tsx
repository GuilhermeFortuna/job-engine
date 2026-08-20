import { fireEvent, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import type { ApplicationRunSummary } from "../types";
import { ApplicationsControlCenter } from "./ApplicationsControlCenter";

const useApplicationRuns = vi.fn();
vi.mock("../hooks/useApplicationRuns", () => ({
  useApplicationRuns: () => useApplicationRuns(),
}));

const useApplicationRuntimeSnapshot = vi.fn();
vi.mock("../hooks/useApplicationRuntime", () => ({
  useApplicationRuntimeSnapshot: () => useApplicationRuntimeSnapshot(),
}));

function run(
  overrides: Partial<ApplicationRunSummary> = {},
): ApplicationRunSummary {
  return {
    id: "run-active",
    job_group_id: "job-1",
    canonical_application_url: "https://jobs.example.com/one",
    application_url: "https://jobs.example.com/one",
    platform_adapter_id: "generic",
    resume_asset_id: "resume-private-id",
    resume_sha256: "ab".repeat(32),
    automation_mode: "full_auto",
    automatic_submission_authorized_at: "2026-08-20T10:00:00Z",
    automatic_submission_authorized: true,
    status: "running",
    current_step: "questions",
    current_checkpoint: "questions_answered",
    submit_attempted_at: null,
    terminal_reason: null,
    receipt_summary: null,
    policy_snapshot: { profile_version: 3, answer_bank_hash: "private" },
    created_at: "2026-08-20T09:00:00Z",
    updated_at: "2026-08-20T10:00:00Z",
    started_at: "2026-08-20T09:01:00Z",
    completed_at: null,
    ...overrides,
  };
}

const active = run();
const attention = run({
  id: "run-attention",
  status: "needs_input",
  automation_mode: "semi_auto_pause_before_submit",
  current_checkpoint: "submit_armed",
  terminal_reason: "owner_input_required",
  application_url: "javascript:alert(1)",
});
const terminal = run({
  id: "run-terminal",
  status: "submission_unknown",
  current_checkpoint: "submitting",
  terminal_reason: "secret applicant data at /home/user/resume.pdf",
  receipt_summary: {
    platform_adapter_id: "generic",
    final_url: "https://jobs.example.com/receipt",
    platform_receipt_id: "receipt-42",
    confirmation_signal: "confirmation page observed",
    capture_timestamp: "2026-08-20T11:00:00Z",
    artifact_hash: "private-artifact-hash",
    summary_notes: null,
  },
  completed_at: "2026-08-20T11:00:00Z",
});

describe("ApplicationsControlCenter", () => {
  const refresh = vi.fn();

  beforeEach(() => {
    refresh.mockReset();
    useApplicationRuns.mockReset();
    useApplicationRuntimeSnapshot.mockReset();
    useApplicationRuns.mockReturnValue({
      runs: {
        items: [active, attention, terminal],
        total: 3,
        page: 1,
        page_size: 25,
        total_pages: 1,
      },
      isLoading: false,
      error: null,
      connectionState: "connected",
      isStale: false,
      streamError: null,
      refresh,
    });
    useApplicationRuntimeSnapshot.mockReturnValue({
      runtimeState: {
        runId: "run-active",
        phase: "filling",
        status: "running",
        checkpoint: "questions_answered",
        automationMode: "full_auto",
        adapterId: "generic",
        reasonCode: null,
        blockingFieldCount: 0,
      },
      isLoading: false,
      error: null,
    });
  });

  it("groups durable statuses while retaining exact backend status labels", () => {
    renderWithProviders(<ApplicationsControlCenter />);

    expect(
      within(screen.getByRole("region", { name: "Active and queued" })).getByText(
        "running",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Needs attention" })).getByText(
        "needs_input",
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "Terminal" })).getByText(
        "submission_unknown",
      ),
    ).toBeInTheDocument();
  });

  it("shows durable run fields, safe summaries, receipt, and workspace links", () => {
    renderWithProviders(<ApplicationsControlCenter />);

    const activeRow = screen.getByRole("article", {
      name: "Application run run-active",
    });
    expect(activeRow).toHaveTextContent("Job job-1");
    expect(activeRow).toHaveTextContent("questions_answered");
    expect(activeRow).toHaveTextContent("full_auto");
    expect(activeRow).toHaveTextContent("abababab…abab");
    expect(activeRow).toHaveTextContent("Aug");
    expect(
      within(activeRow).getByRole("link", { name: "Open application workspace" }),
    ).toHaveAttribute("href", "/applications/run-active/workspace");
    expect(
      within(activeRow).getByRole("link", { name: "Open external application" }),
    ).toHaveAttribute("href", "https://jobs.example.com/one");

    const attentionRow = screen.getByRole("article", {
      name: "Application run run-attention",
    });
    expect(attentionRow).toHaveTextContent("Owner input required");
    expect(attentionRow).toHaveTextContent(
      "Open the workspace to provide the information required",
    );
    expect(attentionRow).not.toHaveTextContent("owner_input_required");
    expect(
      within(attentionRow).queryByRole("link", {
        name: "Open external application",
      }),
    ).not.toBeInTheDocument();

    const terminalRow = screen.getByRole("article", {
      name: "Application run run-terminal",
    });
    expect(terminalRow).toHaveTextContent("Submission status unknown");
    expect(terminalRow).toHaveTextContent(
      "Verify the application with the employer",
    );
    expect(terminalRow).not.toHaveTextContent("secret applicant data");
    expect(terminalRow).not.toHaveTextContent("/home/user/resume.pdf");
    expect(terminalRow).toHaveTextContent("receipt-42");
    expect(terminalRow).toHaveTextContent("confirmation page observed");
    expect(terminalRow).not.toHaveTextContent("private-artifact-hash");
    expect(activeRow).not.toHaveTextContent("resume-private-id");
    expect(activeRow).not.toHaveTextContent("private");
  });

  it("applies desktop runtime progress only to its matching run", () => {
    renderWithProviders(<ApplicationsControlCenter />);

    const activeRow = screen.getByRole("article", {
      name: "Application run run-active",
    });
    const attentionRow = screen.getByRole("article", {
      name: "Application run run-attention",
    });
    expect(activeRow).toHaveTextContent("Runtime progress: filling");
    expect(activeRow).toHaveTextContent("Embedded view attached");
    expect(attentionRow).not.toHaveTextContent("Runtime progress: filling");
    expect(useApplicationRuntimeSnapshot).toHaveBeenCalledTimes(1);
  });

  it("shows clear safe guidance for terminal failures and cancellations", () => {
    useApplicationRuns.mockReturnValue({
      runs: {
        items: [
          run({
            id: "run-failed",
            status: "failed_final",
            terminal_reason: "private backend traceback",
          }),
          run({
            id: "run-cancelled",
            status: "cancelled",
            terminal_reason: "owner email and private reason",
          }),
        ],
        total: 2,
        page: 1,
        page_size: 25,
        total_pages: 1,
      },
      isLoading: false,
      error: null,
      connectionState: "connected",
      isStale: false,
      streamError: null,
      refresh,
    });

    renderWithProviders(<ApplicationsControlCenter />);

    expect(screen.getByText("Application failed")).toBeInTheDocument();
    expect(screen.getByText("Application cancelled")).toBeInTheDocument();
    expect(screen.queryByText(/private backend traceback/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner email/)).not.toBeInTheDocument();
  });

  it("shows fixed auth or CAPTCHA guidance for a non-runtime paused row", () => {
    useApplicationRuns.mockReturnValue({
      runs: {
        items: [
          run({
            id: "run-paused",
            status: "paused_auth",
            terminal_reason: "secret auth payload",
          }),
        ],
        total: 1,
        page: 1,
        page_size: 25,
        total_pages: 1,
      },
      isLoading: false,
      error: null,
      connectionState: "connected",
      isStale: false,
      streamError: null,
      refresh,
    });

    renderWithProviders(<ApplicationsControlCenter />);

    const pausedRow = screen.getByRole("article", {
      name: "Application run run-paused",
    });
    expect(pausedRow).toHaveTextContent("Authentication required");
    expect(pausedRow).toHaveTextContent(
      "Authentication or CAPTCHA is blocking automation",
    );
    expect(pausedRow).not.toHaveTextContent("secret auth payload");
    expect(pausedRow).not.toHaveTextContent("Runtime progress");
  });

  it.each([
    ["connecting", "Connecting to live application updates"],
    ["degraded", "Live updates degraded; displayed runs may be stale"],
    ["connected", "Live application updates connected"],
  ] as const)("announces %s SSE state", (connectionState, message) => {
    useApplicationRuns.mockReturnValue({
      runs: { items: [], total: 0, page: 1, page_size: 25, total_pages: 1 },
      isLoading: false,
      error: null,
      connectionState,
      isStale: connectionState !== "connected",
      streamError:
        connectionState === "degraded" ? "Stream disconnected" : null,
      refresh,
    });

    renderWithProviders(<ApplicationsControlCenter />);

    expect(screen.getByRole("status")).toHaveTextContent(message);
    if (connectionState === "degraded") {
      fireEvent.click(screen.getByRole("button", { name: "Refresh applications" }));
      expect(refresh).toHaveBeenCalledTimes(1);
    }
  });

  it("announces recovery after a degraded stream reconnects", () => {
    let connectionState: "connected" | "degraded" = "degraded";
    useApplicationRuns.mockImplementation(() => ({
      runs: { items: [], total: 0, page: 1, page_size: 25, total_pages: 1 },
      isLoading: false,
      error: null,
      connectionState,
      isStale: connectionState !== "connected",
      streamError:
        connectionState === "degraded" ? "Stream disconnected" : null,
      refresh,
    }));
    const { rerender } = renderWithProviders(<ApplicationsControlCenter />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Live updates degraded",
    );

    connectionState = "connected";
    rerender(<ApplicationsControlCenter />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Live application updates recovered",
    );
  });

  it("shows visible and total counts with load-more state and errors", () => {
    const loadMore = vi.fn();
    useApplicationRuns.mockReturnValue({
      runs: {
        items: [active, attention, terminal],
        total: 40,
        page: 1,
        page_size: 25,
        total_pages: 2,
      },
      isLoading: false,
      isLoadingMore: true,
      error: null,
      loadMoreError: "Second page unavailable",
      connectionState: "connected",
      isStale: false,
      streamError: null,
      hasMore: true,
      refresh,
      loadMore,
    });

    renderWithProviders(<ApplicationsControlCenter />);

    expect(screen.getByText("Showing 3 of 40 application runs")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Loading more applications" }))
      .toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load more application runs",
    );
  });

  it("disables load more while the durable list is refreshing", () => {
    useApplicationRuns.mockReturnValue({
      runs: {
        items: [active],
        total: 2,
        page: 1,
        page_size: 1,
        total_pages: 2,
      },
      isLoading: true,
      isLoadingMore: false,
      error: null,
      loadMoreError: null,
      connectionState: "connected",
      isStale: false,
      streamError: null,
      hasMore: true,
      refresh,
      loadMore: vi.fn(),
    });

    renderWithProviders(<ApplicationsControlCenter />);

    expect(screen.getByRole("button", { name: "Load more applications" }))
      .toBeDisabled();
  });

  it("handles loading, empty, and API error states", () => {
    useApplicationRuns.mockReturnValue({
      runs: null,
      isLoading: true,
      error: "Runs API unavailable",
      connectionState: "connecting",
      isStale: true,
      streamError: null,
      refresh,
    });
    const { rerender } = renderWithProviders(<ApplicationsControlCenter />);
    expect(screen.getByText("Loading application runs")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to load application runs",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Runs API unavailable",
    );

    useApplicationRuns.mockReturnValue({
      runs: { items: [], total: 0, page: 1, page_size: 25, total_pages: 1 },
      isLoading: false,
      error: null,
      connectionState: "connected",
      isStale: false,
      streamError: null,
      refresh,
    });
    rerender(<ApplicationsControlCenter />);
    expect(screen.getByText("No application runs yet")).toBeInTheDocument();
  });
});
