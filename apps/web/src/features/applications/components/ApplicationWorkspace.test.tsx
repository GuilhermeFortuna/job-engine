import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationWorkspace } from "./ApplicationWorkspace";
import {
  MIN_WORKSPACE_HEIGHT,
  MIN_WORKSPACE_WIDTH,
  type DesktopBrowserState,
  type DesktopRuntimeState,
} from "../desktop-bridge";
import {
  FULL_AUTO_MODE,
  SEMI_AUTO_MODE,
  type ApplicationRunDetail,
  type SafeException,
} from "../types";

const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const JOB_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/features/jobs/api", () => ({
  fetchJobDetail: vi.fn().mockResolvedValue({
    id: "11111111-1111-4111-8111-111111111111",
    title: "Staff Engineer",
    company: "Apex",
    sources: [{ source_id: "himalayas", source_name: "Himalayas", application_url: "https://example.com" }],
  }),
}));

const fetchApplicationRunDetail = vi.fn();
const streamApplicationRunEvents = vi.fn();
const fetchResumes = vi.fn();
const releaseSubmit = vi.fn();
const resolveExceptionAnswers = vi.fn();
const resumeApplicationRun = vi.fn();
const cancelApplicationRun = vi.fn();
const useApplicationRuntime = vi.fn();

vi.mock("../hooks/useApplicationRuntime", () => ({
  useApplicationRuntime: (...args: unknown[]) => useApplicationRuntime(...args),
}));

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchApplicationRunDetail: (...args: unknown[]) => fetchApplicationRunDetail(...args),
    streamApplicationRunEvents: (...args: unknown[]) => streamApplicationRunEvents(...args),
    fetchResumes: (...args: unknown[]) => fetchResumes(...args),
    releaseSubmit: (...args: unknown[]) => releaseSubmit(...args),
    resolveExceptionAnswers: (...args: unknown[]) => resolveExceptionAnswers(...args),
    resumeApplicationRun: (...args: unknown[]) => resumeApplicationRun(...args),
    cancelApplicationRun: (...args: unknown[]) => cancelApplicationRun(...args),
  };
});

const subscribeBrowserState = vi.fn();
const setApplicationBounds = vi.fn();
const openApplicationView = vi.fn();
const closeApplicationView = vi.fn();
const getCapabilities = vi.fn();
const goBack = vi.fn();
const goForward = vi.fn();
const reloadApplicationView = vi.fn();

vi.mock("../desktop-bridge", async () => {
  const actual = await vi.importActual<typeof import("../desktop-bridge")>("../desktop-bridge");
  return {
    ...actual,
    getCapabilities: (...args: unknown[]) => getCapabilities(...args),
    subscribeBrowserState: (...args: unknown[]) => subscribeBrowserState(...args),
    setApplicationBounds: (...args: unknown[]) => setApplicationBounds(...args),
    openApplicationView: (...args: unknown[]) => openApplicationView(...args),
    closeApplicationView: (...args: unknown[]) => closeApplicationView(...args),
    goBack: (...args: unknown[]) => goBack(...args),
    goForward: (...args: unknown[]) => goForward(...args),
    reloadApplicationView: (...args: unknown[]) =>
      reloadApplicationView(...args),
  };
});

const armedException: SafeException = {
  id: "ex-armed",
  run_id: RUN_ID,
  exception_type: "semi_auto_armed",
  status: "pending",
  field_reports: [
    {
      field_fingerprint: "fp1",
      label: "Name",
      control_type: "text",
      required: true,
      status: "AUTO_FILL",
      reason_code: null,
      question_intent: null,
      options: [],
      min_length: null,
      max_length: null,
      pattern: null,
      allow_save_to_answer_bank: false,
    },
  ],
  created_at: "2026-08-19T00:00:00Z",
  resolved_at: null,
};

function detail(overrides: Partial<ApplicationRunDetail> = {}): ApplicationRunDetail {
  return {
    id: RUN_ID,
    job_group_id: JOB_ID,
    canonical_application_url: "https://boards.greenhouse.io/apex/jobs/1",
    application_url: "https://boards.greenhouse.io/apex/jobs/1",
    platform_adapter_id: "greenhouse",
    resume_asset_id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    resume_sha256: "cc".repeat(32),
    automation_mode: SEMI_AUTO_MODE,
    automatic_submission_authorized_at: null,
    automatic_submission_authorized: false,
    status: "needs_input",
    current_step: "Armed",
    current_checkpoint: "submit_armed",
    submit_attempted_at: null,
    terminal_reason: null,
    receipt_summary: null,
    policy_snapshot: { resume_id: "res_primary_pdf" },
    created_at: "2026-08-19T00:00:00Z",
    updated_at: "2026-08-19T00:00:00Z",
    started_at: "2026-08-19T00:00:01Z",
    completed_at: null,
    events: [],
    exceptions: [armedException],
    evidence: [],
    ...overrides,
  };
}

describe("ApplicationWorkspace", () => {
  beforeEach(() => {
    fetchApplicationRunDetail.mockReset();
    streamApplicationRunEvents.mockReset();
    fetchResumes.mockReset();
    releaseSubmit.mockReset();
    subscribeBrowserState.mockReset();
    setApplicationBounds.mockReset();
    openApplicationView.mockReset();
    closeApplicationView.mockReset();
    getCapabilities.mockReset();
    goBack.mockReset();
    goForward.mockReset();
    reloadApplicationView.mockReset();
    fetchApplicationRunDetail.mockResolvedValue(detail());
    streamApplicationRunEvents.mockImplementation(() => new Promise(() => {}));
    fetchResumes.mockResolvedValue([
      {
        id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
        resume_id: "res_primary_pdf",
        label: "Primary resume",
        sha256: "cc".repeat(32),
        checksum_summary: "cccccccc…cccc",
        language: "en",
        is_default: true,
        file_size_bytes: 1024,
        version: 1,
      },
    ]);
    getCapabilities.mockResolvedValue({ embeddedBrowser: true, platform: "linux" });
    subscribeBrowserState.mockImplementation((listener: (state: DesktopBrowserState) => void) => {
      listener({
        runId: RUN_ID,
        displayUrl: "https://boards.greenhouse.io/apex/jobs/1",
        title: "Apply",
        isLoading: false,
        canGoBack: false,
        canGoForward: false,
        blockedNavigationReason: null,
      });
      return vi.fn();
    });
    setApplicationBounds.mockResolvedValue({ success: true });
    openApplicationView.mockResolvedValue({ success: true });
    closeApplicationView.mockResolvedValue({ success: true });
    goBack.mockResolvedValue({ success: true });
    goForward.mockResolvedValue({ success: true });
    reloadApplicationView.mockResolvedValue({ success: true });
    useApplicationRuntime.mockReturnValue({
      runtimeState: {
        runId: RUN_ID,
        phase: "armed",
        status: "needs_input",
        checkpoint: "submit_armed",
        automationMode: SEMI_AUTO_MODE,
        adapterId: "greenhouse",
        reasonCode: null,
        blockingFieldCount: 0,
      } satisfies DesktopRuntimeState,
      viewAttached: false,
      isLoading: false,
      error: null,
    });
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
      x: 300,
      y: 90,
      width: 700,
      height: 500,
      top: 90,
      left: 300,
      bottom: 590,
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
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("subscribes, reports bounds, then opens by run ID and closes once on unmount", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        status: "queued",
        current_checkpoint: "profile_filled",
        exceptions: [],
      }),
    );
    useApplicationRuntime.mockReturnValue({
      runtimeState: {
        runId: RUN_ID,
        phase: "queued",
        status: "queued",
        checkpoint: "profile_filled",
        automationMode: SEMI_AUTO_MODE,
        adapterId: "greenhouse",
        reasonCode: null,
        blockingFieldCount: 0,
      } satisfies DesktopRuntimeState,
      viewAttached: false,
      isLoading: false,
      error: null,
    });
    const view = renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await screen.findByRole("heading", { name: "Application context" });
    await waitFor(() => {
      expect(subscribeBrowserState).toHaveBeenCalled();
      expect(setApplicationBounds).toHaveBeenCalled();
      expect(openApplicationView).toHaveBeenCalledWith(RUN_ID);
    });
    const boundsCallIndex = setApplicationBounds.mock.invocationCallOrder[0];
    const openCallIndex = openApplicationView.mock.invocationCallOrder[0];
    expect(boundsCallIndex).toBeLessThan(openCallIndex);
    expect(openApplicationView.mock.calls[0][0]).not.toMatch(/^https?:/);
    view.unmount();
    expect(closeApplicationView).toHaveBeenCalledTimes(1);
  });

  it("keeps an attached desktop view positioned when viewport bounds change", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        status: "queued",
        current_checkpoint: "profile_filled",
        exceptions: [],
      }),
    );
    const view = renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await waitFor(() => expect(openApplicationView).toHaveBeenCalledOnce());
    setApplicationBounds.mockClear();
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 320,
      y: 100,
      width: 680,
      height: 480,
      top: 100,
      left: 320,
      bottom: 580,
      right: 1000,
      toJSON() {
        return {};
      },
    } as DOMRect);

    window.dispatchEvent(new Event("scroll"));

    await waitFor(() =>
      expect(setApplicationBounds).toHaveBeenCalledWith(
        expect.objectContaining({ x: 320, y: 100, width: 680, height: 480 }),
      ),
    );
    expect(openApplicationView).toHaveBeenCalledOnce();
    view.unmount();
  });

  it("persists an accepted queued desktop-open notice at the destination without claiming resume", async () => {
    renderWithProviders(
      <ApplicationWorkspace
        runId={RUN_ID}
        launchOutcome="desktop_open_requested"
      />,
    );
    await screen.findByRole("heading", { name: "Application context" });
    const status = screen.getByRole("status", { name: "Launch outcome" });
    expect(status).toHaveTextContent("Run accepted and queued");
    expect(status).toHaveTextContent("desktop view request was accepted");
    expect(status).toHaveTextContent(
      "Automation has not resumed unless this run reports claiming or filling.",
    );
  });

  it("persists a safe unavailable desktop-open notice at the destination", async () => {
    renderWithProviders(
      <ApplicationWorkspace
        runId={RUN_ID}
        launchOutcome="desktop_open_unavailable"
      />,
    );
    await screen.findByRole("heading", { name: "Application context" });
    const alert = screen.getByRole("alert", { name: "Launch outcome" });
    expect(alert).toHaveTextContent("Run accepted and queued");
    expect(alert).toHaveTextContent(
      "desktop application view was unavailable or failed to open",
    );
    expect(alert).not.toHaveTextContent(/secret|path|ipc/i);
  });

  it("shows durable mode, authorization, matching runtime progress, and surrendered view state", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        automation_mode: FULL_AUTO_MODE,
        automatic_submission_authorized: true,
        automatic_submission_authorized_at: "2026-08-20T01:02:03Z",
        status: "running",
        current_checkpoint: "profile_filled",
        exceptions: [],
      }),
    );
    useApplicationRuntime.mockReturnValue({
      runtimeState: {
        runId: RUN_ID,
        phase: "filling",
        status: "running",
        checkpoint: "questions_answered",
        automationMode: FULL_AUTO_MODE,
        adapterId: "greenhouse",
        reasonCode: null,
        blockingFieldCount: 0,
      } satisfies DesktopRuntimeState,
      viewAttached: true,
      isLoading: false,
      error: null,
    });
    const view = renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    expect(await screen.findByText(/Mode: full auto/i)).toBeInTheDocument();
    expect(screen.getByText(/Automatic submission authorized/i)).toHaveTextContent(
      "2026-08-20T01:02:03Z",
    );
    expect(screen.getByText(/Runtime phase: filling/i)).toBeInTheDocument();
    expect(screen.getByText(/Resumed progress confirmed/i)).toBeInTheDocument();

    useApplicationRuntime.mockReturnValue({
      runtimeState: {
        runId: RUN_ID,
        phase: "armed",
        status: "needs_input",
        checkpoint: "submit_armed",
        automationMode: SEMI_AUTO_MODE,
        adapterId: "greenhouse",
        reasonCode: "NEEDS_INPUT",
        blockingFieldCount: 0,
      } satisfies DesktopRuntimeState,
      viewAttached: false,
      isLoading: false,
      error: null,
    });
    fetchApplicationRunDetail.mockResolvedValue(detail());
    view.unmount();
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    expect(await screen.findByText(/view surrendered/i)).toBeInTheDocument();
  });

  it("never offers full-auto release and suppresses activating actions once submit starts", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        automation_mode: FULL_AUTO_MODE,
        automatic_submission_authorized: true,
        automatic_submission_authorized_at: "2026-08-20T01:02:03Z",
        status: "needs_input",
        current_checkpoint: "submit_armed",
        submit_attempted_at: "2026-08-20T01:02:04Z",
        exceptions: [armedException],
      }),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await screen.findByRole("heading", { name: "Application context" });
    expect(
      screen.queryByRole("button", { name: /submit application/i }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /resume application/i }),
    ).not.toBeInTheDocument();
    expect(openApplicationView).not.toHaveBeenCalled();
    expect(screen.getByText(/submission already started/i)).toBeInTheDocument();
  });

  it("allows a browser durable mutation but requires desktop to continue", async () => {
    const unresolvedException: SafeException = {
      ...armedException,
      id: "ex-browser",
      exception_type: "unresolved_question",
      field_reports: [
        { ...armedException.field_reports[0], status: "REVIEW_REQUIRED" },
      ],
    };
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        current_checkpoint: "profile_filled",
        exceptions: [unresolvedException],
      }),
    );
    getCapabilities.mockResolvedValue({
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    });
    resolveExceptionAnswers.mockResolvedValue(
      detail({ status: "queued", exceptions: [] }),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Safe value" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    expect(
      await screen.findByText(/resolved — continue from desktop/i),
    ).toBeInTheDocument();
    expect(resolveExceptionAnswers).toHaveBeenCalledOnce();
    expect(openApplicationView).not.toHaveBeenCalled();
  });

  it("keeps a completed durable mutation when desktop reopen fails", async () => {
    releaseSubmit.mockResolvedValue(detail({ status: "queued" }));
    openApplicationView.mockResolvedValue({ success: false, error: "IPC secret" });
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    fireEvent.click(
      await screen.findByRole("button", { name: /submit application/i }),
    );
    expect(
      await screen.findByText(/released — continue from desktop/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/IPC secret/i)).not.toBeInTheDocument();
  });

  it("gives submission-unknown verification guidance and no retry action", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        status: "submission_unknown",
        current_checkpoint: "submitting",
        submit_attempted_at: "2026-08-20T01:02:04Z",
        terminal_reason: "secret backend stack",
        exceptions: [],
      }),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    expect(await screen.findByText(/verify directly in the ATS/i)).toBeInTheDocument();
    expect(screen.getByText(/confirmation email/i)).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /open external application/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/secret backend stack/i)).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /resume|submit application/i }),
    ).not.toBeInTheDocument();
  });

  it("marks disconnected SSE data stale without exposing the stream error", async () => {
    streamApplicationRunEvents.mockRejectedValue(
      new Error("stream secret /home/owner"),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    expect(
      await screen.findByText(/live updates disconnected.*may be stale/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/stream secret|\/home\/owner/i)).not.toBeInTheDocument();
  });

  it("sanitizes workspace API load errors", async () => {
    fetchApplicationRunDetail.mockRejectedValue(
      new Error("secret owner data at /home/owner/resume.pdf"),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Unable to load application workspace.");
    expect(alert).toHaveTextContent(
      "Return to Applications and try opening this run again.",
    );
    expect(alert).not.toHaveTextContent(/secret|owner|resume|\/home/i);
  });

  it("closes once when shrinking below 1280x720 and reopens after returning to supported size", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({ status: "queued", current_checkpoint: "profile_filled", exceptions: [] }),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await waitFor(() => expect(openApplicationView).toHaveBeenCalled());
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/1280/);
      expect(closeApplicationView).toHaveBeenCalledTimes(1);
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: MIN_WORKSPACE_WIDTH,
    });
    window.dispatchEvent(new Event("resize"));
    await waitFor(() => {
      expect(openApplicationView).toHaveBeenCalledTimes(2);
    });
  });

  it("enables submit for the matching armed run and ignores a second click", async () => {
    const order: string[] = [];
    releaseSubmit.mockImplementation(
      () => {
        order.push("release");
        return new Promise((resolve) =>
          setTimeout(() => resolve(detail({ status: "queued" })), 50),
        );
      },
    );
    openApplicationView.mockImplementation(async () => {
      order.push("open");
      return { success: true };
    });
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    const submit = await screen.findByRole("button", { name: /submit application/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(releaseSubmit).toHaveBeenCalledTimes(1));
    expect(releaseSubmit).toHaveBeenCalledWith(RUN_ID, "Submit this application");
    await waitFor(() => expect(openApplicationView).toHaveBeenCalledTimes(1));
    expect(order).toEqual(["release", "open"]);
  });

  it("sanitizes release-submit and cancel failures with action-specific guidance", async () => {
    releaseSubmit.mockRejectedValue(
      new Error("submit secret at /home/owner/resume.pdf"),
    );
    cancelApplicationRun.mockRejectedValue(
      new Error("cancel API detail with owner data"),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    const submit = await screen.findByRole("button", {
      name: /submit application/i,
    });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    expect(
      await screen.findByText(
        "Submission release failed. Review the application and try again.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /cancel run/i }));
    expect(
      await screen.findByText(
        "Cancellation failed. Review the run status and try again.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/submit secret|cancel API detail|\/home|owner data/i),
    ).not.toBeInTheDocument();
  });

  it("resolves ordinary input before reopening and sanitizes failure guidance", async () => {
    const unresolvedException: SafeException = {
      ...armedException,
      id: "ex-unresolved",
      exception_type: "missing_profile_field",
      field_reports: [
        {
          ...armedException.field_reports[0],
          status: "REVIEW_REQUIRED",
        },
      ],
    };
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        current_checkpoint: "profile_filled",
        exceptions: [unresolvedException],
      }),
    );
    resolveExceptionAnswers.mockRejectedValue(
      new Error("answer bank secret /home/owner"),
    );
    const view = renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Safe value" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    expect(
      await screen.findByText(
        "Answer update failed. Review the answers and try again.",
      ),
    ).toBeInTheDocument();
    view.unmount();

    const order: string[] = [];
    resolveExceptionAnswers.mockImplementation(async () => {
      order.push("resolve");
      return detail({ status: "queued", exceptions: [] });
    });
    openApplicationView.mockImplementation(async () => {
      order.push("open");
      return { success: true };
    });
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    fireEvent.change(await screen.findByLabelText("Name"), {
      target: { value: "Safe value" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answers/i }));
    await waitFor(() => expect(order).toEqual(["resolve", "open"]));
  });

  it("resumes only retryable failures, then reopens, while warning repeats are possible", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        status: "failed_retryable",
        current_checkpoint: "profile_filled",
        exceptions: [],
      }),
    );
    useApplicationRuntime.mockReturnValue({
      runtimeState: {
        runId: RUN_ID,
        phase: "paused",
        status: "failed_retryable",
        checkpoint: "profile_filled",
        automationMode: SEMI_AUTO_MODE,
        adapterId: "greenhouse",
        reasonCode: "STEP_EXHAUSTED",
        blockingFieldCount: 0,
      } satisfies DesktopRuntimeState,
      viewAttached: false,
      isLoading: false,
      error: null,
    });
    const order: string[] = [];
    resumeApplicationRun.mockImplementation(async () => {
      order.push("resume");
      return detail({ status: "queued", exceptions: [] });
    });
    openApplicationView.mockImplementation(async () => {
      order.push("open");
      return { success: true };
    });
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    expect(await screen.findByText(/resuming may repeat/i)).toBeInTheDocument();
    fireEvent.click(
      await screen.findByRole("button", { name: /resume application/i }),
    );
    await waitFor(() => expect(order).toEqual(["resume", "open"]));
  });

  it("blocks paused authentication from resume loops and offers cancel plus a safe external link", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({
        status: "paused_auth",
        current_checkpoint: "profile_filled",
        exceptions: [],
      }),
    );
    useApplicationRuntime.mockReturnValue({
      runtimeState: {
        runId: RUN_ID,
        phase: "paused",
        status: "paused_auth",
        checkpoint: "profile_filled",
        automationMode: SEMI_AUTO_MODE,
        adapterId: "greenhouse",
        reasonCode: "AUTH_REQUIRED",
        blockingFieldCount: 0,
      } satisfies DesktopRuntimeState,
      viewAttached: false,
      isLoading: false,
      error: null,
    });
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await screen.findByRole("heading", { name: "Application context" });
    expect(
      screen.queryByRole("button", { name: /resume application/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /cancel run/i })).toBeEnabled();
    expect(
      screen.getByRole("link", { name: /open external application/i }),
    ).toHaveAttribute("href", "https://boards.greenhouse.io/apex/jobs/1");
    expect(openApplicationView).not.toHaveBeenCalled();
  });

  it("sanitizes desktop toolbar operation failures", async () => {
    subscribeBrowserState.mockImplementation(
      (listener: (state: DesktopBrowserState) => void) => {
        listener({
          runId: RUN_ID,
          displayUrl: "https://boards.greenhouse.io/apex/jobs/1",
          title: "Apply",
          isLoading: false,
          canGoBack: true,
          canGoForward: true,
          blockedNavigationReason: null,
        });
        return vi.fn();
      },
    );
    goBack.mockRejectedValue(new Error("back IPC secret"));
    goForward.mockRejectedValue(new Error("forward IPC secret"));
    reloadApplicationView.mockRejectedValue(new Error("reload IPC secret"));
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await screen.findByRole("heading", { name: "Application context" });

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    expect(
      await screen.findByText(
        "Unable to navigate back in the desktop application view.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Forward" }));
    expect(
      await screen.findByText(
        "Unable to navigate forward in the desktop application view.",
      ),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reload" }));
    expect(
      await screen.findByText(
        "Unable to reload the desktop application view.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/IPC secret/i)).not.toBeInTheDocument();
  });

  it("sanitizes desktop positioning and open failures", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({ status: "queued", current_checkpoint: "profile_filled", exceptions: [] }),
    );
    setApplicationBounds.mockRejectedValueOnce(
      new Error("bounds IPC /home/owner"),
    );
    const positionView = renderWithProviders(
      <ApplicationWorkspace runId={RUN_ID} />,
    );
    expect(
      await screen.findByText(
        "Unable to position the desktop application view.",
      ),
    ).toBeInTheDocument();
    positionView.unmount();

    setApplicationBounds.mockResolvedValue({ success: true });
    openApplicationView.mockRejectedValueOnce(
      new Error("open IPC secret token"),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    expect(
      await screen.findByText(
        "Unable to open the desktop application view. The run remains available in this workspace.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/IPC|\/home|secret token/i)).not.toBeInTheDocument();
  });

  it("sanitizes desktop close failures", async () => {
    fetchApplicationRunDetail.mockResolvedValue(
      detail({ status: "queued", current_checkpoint: "profile_filled", exceptions: [] }),
    );
    closeApplicationView.mockRejectedValueOnce(
      new Error("close IPC secret token"),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    await waitFor(() => expect(openApplicationView).toHaveBeenCalled());
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    window.dispatchEvent(new Event("resize"));

    expect(
      await screen.findByText(
        "Unable to close the desktop application view.",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/close IPC|secret token/i)).not.toBeInTheDocument();
  });
});
