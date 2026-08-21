import { fireEvent, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationLauncher } from "./ApplicationLauncher";
import { ApiConflictError } from "../api";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const getCapabilities = vi.fn();
const openApplicationView = vi.fn();
vi.mock("../desktop-bridge", () => ({
  getCapabilities: () => getCapabilities(),
  openApplicationView: (...args: unknown[]) => openApplicationView(...args),
  isProductionRuntimeReady: (capabilities: { productionRuntime: boolean }) =>
    capabilities.productionRuntime,
}));

const useApplicationReadiness = vi.fn();
vi.mock("../hooks/useApplicationReadiness", () => ({
  useApplicationReadiness: () => useApplicationReadiness(),
}));

const fetchResumes = vi.fn();
const fetchApplicantProfile = vi.fn();
const createApplicationRun = vi.fn();
const overrideDuplicateRun = vi.fn();
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchResumes: (...args: unknown[]) => fetchResumes(...args),
    fetchApplicantProfile: (...args: unknown[]) =>
      fetchApplicantProfile(...args),
    createApplicationRun: (...args: unknown[]) => createApplicationRun(...args),
    overrideDuplicateRun: (...args: unknown[]) => overrideDuplicateRun(...args),
  };
});

const JOB_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const EXISTING_RUN_ID = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

const resumes = [
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
  {
    id: "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee",
    resume_id: "res_alternate_pdf",
    label: "Alternate resume",
    sha256: "dd".repeat(32),
    checksum_summary: "dddddddd…dddd",
    language: "en",
    is_default: false,
    file_size_bytes: 2048,
    version: 1,
  },
];

describe("ApplicationLauncher", () => {
  beforeEach(() => {
    mockPush.mockReset();
    getCapabilities.mockReset();
    openApplicationView.mockReset();
    useApplicationReadiness.mockReset();
    fetchResumes.mockReset();
    fetchApplicantProfile.mockReset();
    createApplicationRun.mockReset();
    overrideDuplicateRun.mockReset();
    getCapabilities.mockResolvedValue({
      embeddedBrowser: true,
      platform: "linux",
      productionRuntime: true,
    });
    openApplicationView.mockResolvedValue({ success: true });
    useApplicationReadiness.mockReturnValue({
      profile: { id: "profile-1" },
      resumes,
      isReady: true,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    fetchResumes.mockResolvedValue(resumes);
    fetchApplicantProfile.mockResolvedValue({ id: "profile-1" });
  });

  it("preserves the unavailable top-level contract while capability is checking", async () => {
    let resolveCapabilities!: (value: {
      embeddedBrowser: boolean;
      platform: string | null;
      productionRuntime: boolean;
    }) => void;
    getCapabilities.mockReturnValue(
      new Promise((resolve) => {
        resolveCapabilities = resolve;
      }),
    );
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );

    expect(screen.getByText("Automation unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("Checking automation availability."),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("The production desktop runtime is unavailable."),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Auto apply" })).not.toBeInTheDocument();

    resolveCapabilities({
      embeddedBrowser: true,
      platform: "linux",
      productionRuntime: true,
    });
    expect(await screen.findByRole("button", { name: "Auto apply" })).toBeInTheDocument();
  });

  it("restores focus to the stable launcher fallback when readiness refresh unmounts the trigger", async () => {
    const readiness = {
      profile: { id: "profile-1" },
      resumes,
      isReady: true,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
      revision: 1,
    };
    useApplicationReadiness.mockReturnValue(readiness);
    const view = renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    const trigger = await screen.findByRole("button", { name: "Auto apply" });
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();

    useApplicationReadiness.mockReturnValue({
      ...readiness,
      isLoading: true,
    });
    view.rerender(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger.isConnected).toBe(false);
    expect(screen.getByLabelText("Application launcher")).toHaveFocus();
    expect(screen.getByText("Automation unavailable")).toBeInTheDocument();

    useApplicationReadiness.mockReturnValue({
      ...readiness,
      revision: 2,
    });
    view.rerender(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const newTrigger = screen.getByRole("button", { name: "Auto apply" });
    expect(screen.getByLabelText("Application launcher")).toHaveFocus();

    fireEvent.click(newTrigger);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });

  it("requires a new owner click when provider tier changes assisted to auto", async () => {
    const view = renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
        providerTier="unmeasured"
      />,
    );
    const assistedTrigger = await screen.findByRole("button", {
      name: "Apply with assistance",
    });
    fireEvent.click(assistedTrigger);
    expect(
      screen.getByRole("dialog", { name: "Start assisted application" }),
    ).toBeInTheDocument();

    view.rerender(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
        providerTier="measured"
      />,
    );

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const autoTrigger = screen.getByRole("button", { name: "Auto apply" });
    expect(autoTrigger).toHaveFocus();
    expect(createApplicationRun).not.toHaveBeenCalled();

    fireEvent.click(autoTrigger);
    expect(
      screen.getByRole("dialog", { name: "Authorize auto apply" }),
    ).toHaveTextContent("Full auto");
  });

  it("invalidates the selected application target and preserves fallback focus", async () => {
    const view = renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    const originalTrigger = await screen.findByRole("button", {
      name: "Auto apply",
    });
    fireEvent.click(originalTrigger);
    expect(screen.getByRole("dialog")).toHaveTextContent(
      "boards.greenhouse.io",
    );

    view.rerender(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="http://unsafe.example/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(originalTrigger.isConnected).toBe(false);
    expect(screen.getByLabelText("Application launcher")).toHaveFocus();

    view.rerender(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://jobs.lever.co/apex/2"
        sourceName="Lever"
      />,
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const replacementTrigger = screen.getByRole("button", {
      name: "Auto apply",
    });
    fireEvent.click(replacementTrigger);
    expect(screen.getByRole("dialog")).toHaveTextContent("jobs.lever.co");
  });

  it("shows runtime unavailability instead of hiding the launcher", async () => {
    getCapabilities.mockResolvedValue({
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    });
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    await waitFor(() => {
      expect(getCapabilities).toHaveBeenCalled();
    });
    expect(screen.getByText("Automation unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("The production desktop runtime is unavailable."),
    ).toBeInTheDocument();
  });

  it("shows precise HTTPS unavailability instead of hiding the launcher", async () => {
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="http://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    await waitFor(() => {
      expect(getCapabilities).toHaveBeenCalled();
    });
    expect(screen.getByText("Automation unavailable")).toBeInTheDocument();
    expect(
      screen.getByText("Automatic application requires a secure HTTPS URL."),
    ).toBeInTheDocument();
  });

  it("shows profile and résumé readiness failures without sensitive values", async () => {
    useApplicationReadiness.mockReturnValue({
      profile: null,
      resumes: [],
      isReady: false,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    const { rerender } = renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    expect(
      await screen.findByText("Complete the applicant profile before launching."),
    ).toBeInTheDocument();

    useApplicationReadiness.mockReturnValue({
      profile: { id: "profile-1" },
      resumes: [],
      isReady: false,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    rerender(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    expect(
      screen.getByText("Register at least one résumé before launching."),
    ).toBeInTheDocument();
  });

  it("confirms the exact full-auto scope and starts the selected run without a second release", async () => {
    createApplicationRun.mockResolvedValue({
      created_runs: [{ id: RUN_ID, status: "queued" }],
      conflicts: [],
    });
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    const dialog = screen.getByRole("dialog", { name: /authorize auto apply/i });
    expect(dialog).toHaveTextContent("Staff Engineer");
    expect(dialog).toHaveTextContent("Apex");
    expect(dialog).toHaveTextContent("Greenhouse");
    expect(dialog).toHaveTextContent("boards.greenhouse.io");
    expect(dialog).toHaveTextContent("Primary resume");
    expect(dialog).toHaveTextContent("cccccccc…cccc");
    expect(dialog).toHaveTextContent("Full auto");
    expect(dialog).toHaveTextContent(
      "Authorize automatic submission for these selected jobs",
    );
    expect(dialog).toHaveTextContent(/no second release click/i);
    expect(dialog).toHaveTextContent(/genuine exceptions pause/i);

    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));
    await waitFor(() => {
      expect(createApplicationRun).toHaveBeenCalledWith({
        application_target_ids: ["target-1"],
        resume_id: "res_primary_pdf",
        automation_mode: "full_auto",
      });
      expect(openApplicationView).toHaveBeenCalledWith(RUN_ID);
      expect(mockPush).toHaveBeenCalledWith(
        `/applications/${RUN_ID}/workspace?launch=desktop_open_requested`,
      );
    });
  });

  it("keeps the future unmeasured-provider path explicitly assisted", async () => {
    createApplicationRun.mockResolvedValue({
      created_runs: [{ id: RUN_ID, status: "queued" }],
      conflicts: [],
    });
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
        providerTier="unmeasured"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Apply with assistance" }),
    );
    const dialog = screen.getByRole("dialog", {
      name: /start assisted application/i,
    });
    expect(dialog).toHaveTextContent("Assisted");
    expect(dialog).toHaveTextContent(/final release/i);
    expect(dialog).not.toHaveTextContent(
      "Authorize automatic submission for these selected jobs",
    );
    fireEvent.click(
      screen.getByRole("button", { name: /start assisted application/i }),
    );
    await waitFor(() => {
      expect(createApplicationRun).toHaveBeenCalledWith({
        application_target_ids: ["target-1"],
        resume_id: "res_primary_pdf",
        automation_mode: "semi_auto_pause_before_submit",
      });
    });
  });

  it("stops before create when authoritative readiness changed after opening confirmation", async () => {
    fetchResumes.mockResolvedValueOnce([]);
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));

    expect(
      await screen.findByText(
        "Application readiness changed. Review your profile and registered résumé before launching.",
      ),
    ).toBeInTheDocument();
    expect(createApplicationRun).not.toHaveBeenCalled();
    expect(openApplicationView).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("uses a same-tick mutex to prevent duplicate create transactions", async () => {
    createApplicationRun.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    const confirm = screen.getByRole("button", {
      name: /authorize and auto apply/i,
    });
    fireEvent.click(confirm);
    fireEvent.click(confirm);

    await waitFor(() => expect(createApplicationRun).toHaveBeenCalled());
    expect(createApplicationRun).toHaveBeenCalledTimes(1);
    expect(fetchApplicantProfile).toHaveBeenCalledTimes(1);
  });

  it("keeps duplicate confirmation separate and recreates the original explicit mode and résumé", async () => {
    const conflict = new ApiConflictError("Conflict", {
      created_runs: [],
      conflicts: [
        {
          job_group_id: JOB_ID,
          canonical_application_url: "https://boards.greenhouse.io/apex/jobs/1",
          existing_run_id: EXISTING_RUN_ID,
          existing_status: "queued",
          message: "An active run already exists",
        },
      ],
    });
    overrideDuplicateRun.mockResolvedValue({ id: EXISTING_RUN_ID });
    createApplicationRun.mockRejectedValueOnce(conflict).mockResolvedValueOnce({
      created_runs: [{ id: RUN_ID }],
      conflicts: [],
    });

    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
        providerTier="unmeasured"
      />,
    );

    fireEvent.click(
      await screen.findByRole("button", { name: "Apply with assistance" }),
    );
    await screen.findByText(/Primary resume/);
    fireEvent.click(
      screen.getByRole("button", { name: /start assisted application/i }),
    );

    const existing = await screen.findByRole("link", {
      name: /open existing application/i,
    });
    expect(existing).toHaveAttribute(
      "href",
      `/applications/${EXISTING_RUN_ID}/workspace`,
    );
    expect(
      screen.queryByRole("button", { name: /^retry$/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      /separate from mode authorization/i,
    );
    fireEvent.click(screen.getByLabelText(/Alternate resume/));

    fireEvent.change(screen.getByLabelText(/override reason/i), {
      target: { value: "Previous attempt stalled" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /override and create a new run/i }),
    );

    await waitFor(() => {
      expect(overrideDuplicateRun).toHaveBeenCalledWith(EXISTING_RUN_ID, {
        owner_confirmation:
          "Create a new application run despite the duplicate",
        reason: "Previous attempt stalled",
      });
      expect(createApplicationRun).toHaveBeenCalledTimes(2);
      expect(createApplicationRun).toHaveBeenLastCalledWith({
        application_target_ids: ["target-1"],
        resume_id: "res_primary_pdf",
        automation_mode: "semi_auto_pause_before_submit",
      });
      expect(mockPush).toHaveBeenCalledWith(
        `/applications/${RUN_ID}/workspace?launch=desktop_open_requested`,
      );
    });
  });

  it("revalidates readiness again after duplicate override before recreate", async () => {
    const conflict = new ApiConflictError("Conflict", {
      created_runs: [],
      conflicts: [
        {
          job_group_id: JOB_ID,
          canonical_application_url:
            "https://boards.greenhouse.io/apex/jobs/1",
          existing_run_id: EXISTING_RUN_ID,
          existing_status: "queued",
          message: "An active run already exists",
        },
      ],
    });
    fetchResumes
      .mockResolvedValueOnce(resumes)
      .mockResolvedValueOnce(resumes)
      .mockResolvedValueOnce([]);
    createApplicationRun.mockRejectedValueOnce(conflict);
    overrideDuplicateRun.mockResolvedValue({ id: EXISTING_RUN_ID });

    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));
    await screen.findByRole("link", { name: /open existing application/i });
    fireEvent.change(screen.getByLabelText(/override reason/i), {
      target: { value: "Owner confirmed duplicate" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /override and create a new run/i }),
    );

    expect(
      await screen.findByText(
        "Application readiness changed. Review your profile and registered résumé before launching.",
      ),
    ).toBeInTheDocument();
    expect(overrideDuplicateRun).toHaveBeenCalledTimes(1);
    expect(createApplicationRun).toHaveBeenCalledTimes(1);
  });

  it("uses the mutex to prevent same-tick duplicate override transactions", async () => {
    const conflict = new ApiConflictError("Conflict", {
      created_runs: [],
      conflicts: [
        {
          job_group_id: JOB_ID,
          canonical_application_url:
            "https://boards.greenhouse.io/apex/jobs/1",
          existing_run_id: EXISTING_RUN_ID,
          existing_status: "queued",
          message: "An active run already exists",
        },
      ],
    });
    createApplicationRun.mockRejectedValueOnce(conflict);
    overrideDuplicateRun.mockReturnValue(new Promise(() => {}));
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));
    await screen.findByRole("link", { name: /open existing application/i });
    fireEvent.change(screen.getByLabelText(/override reason/i), {
      target: { value: "Owner confirmed duplicate" },
    });
    const override = screen.getByRole("button", {
      name: /override and create a new run/i,
    });
    fireEvent.click(override);
    fireEvent.click(override);

    await waitFor(() => expect(overrideDuplicateRun).toHaveBeenCalled());
    expect(overrideDuplicateRun).toHaveBeenCalledTimes(1);
  });

  it("surfaces only safe create and desktop-view failures", async () => {
    createApplicationRun.mockRejectedValueOnce(
      new Error("secret=/home/owner/private-resume.pdf"),
    );
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unable to create the application run.",
    );
    expect(screen.queryByText(/private-resume|secret=/i)).not.toBeInTheDocument();

    createApplicationRun.mockResolvedValueOnce({
      created_runs: [{ id: RUN_ID, status: "queued" }],
      conflicts: [],
    });
    openApplicationView.mockResolvedValueOnce({
      success: false,
      error: "/home/owner/private-resume.pdf",
    });
    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));
    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/applications/${RUN_ID}/workspace?launch=desktop_open_unavailable`,
      );
    });
    expect(screen.queryByText(/private-resume/i)).not.toBeInTheDocument();
  });

  it("still navigates to the accepted queued run when a broken bridge rejects", async () => {
    createApplicationRun.mockResolvedValue({
      created_runs: [{ id: RUN_ID, status: "queued" }],
      conflicts: [],
    });
    openApplicationView.mockRejectedValue(
      new Error("ipc secret /home/owner/resume.pdf"),
    );
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    fireEvent.click(await screen.findByRole("button", { name: "Auto apply" }));
    fireEvent.click(screen.getByRole("button", { name: /authorize and auto apply/i }));

    await waitFor(() => {
      expect(mockPush).toHaveBeenCalledWith(
        `/applications/${RUN_ID}/workspace?launch=desktop_open_unavailable`,
      );
    });
    expect(screen.queryByText(/ipc secret|owner\/resume/i)).not.toBeInTheDocument();
  });

  it("uses the shared modal focus isolation, Escape close, and focus restore", async () => {
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        applicationTargetId="target-1"
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    const launch = await screen.findByRole("button", { name: "Auto apply" });
    fireEvent.click(launch);
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-modal", "true");
    expect(screen.getByLabelText(/Primary resume/)).toHaveFocus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(launch).toHaveFocus();
  });
});
