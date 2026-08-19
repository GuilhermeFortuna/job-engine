import { fireEvent, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationWorkspace } from "./ApplicationWorkspace";
import {
  MIN_WORKSPACE_HEIGHT,
  MIN_WORKSPACE_WIDTH,
  type DesktopBrowserState,
} from "../desktop-bridge";
import { SEMI_AUTO_MODE, type ApplicationRunDetail, type SafeException } from "../types";

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

vi.mock("../desktop-bridge", async () => {
  const actual = await vi.importActual<typeof import("../desktop-bridge")>("../desktop-bridge");
  return {
    ...actual,
    getCapabilities: (...args: unknown[]) => getCapabilities(...args),
    subscribeBrowserState: (...args: unknown[]) => subscribeBrowserState(...args),
    setApplicationBounds: (...args: unknown[]) => setApplicationBounds(...args),
    openApplicationView: (...args: unknown[]) => openApplicationView(...args),
    closeApplicationView: (...args: unknown[]) => closeApplicationView(...args),
    goBack: vi.fn(),
    goForward: vi.fn(),
    reloadApplicationView: vi.fn(),
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
    status: "needs_input",
    current_step: "Armed",
    current_checkpoint: "submit_armed",
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

  it("closes once when shrinking below 1280x720 and reopens after returning to supported size", async () => {
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
    releaseSubmit.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(detail({ status: "queued" })), 50)),
    );
    renderWithProviders(<ApplicationWorkspace runId={RUN_ID} />);
    const submit = await screen.findByRole("button", { name: /submit application/i });
    await waitFor(() => expect(submit).toBeEnabled());
    fireEvent.click(submit);
    fireEvent.click(submit);
    await waitFor(() => expect(releaseSubmit).toHaveBeenCalledTimes(1));
    expect(releaseSubmit).toHaveBeenCalledWith(RUN_ID, "Submit this application");
  });
});
