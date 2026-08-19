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
vi.mock("../desktop-bridge", () => ({
  getCapabilities: () => getCapabilities(),
}));

const fetchResumes = vi.fn();
const createApplicationRun = vi.fn();
const overrideDuplicateRun = vi.fn();
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchResumes: (...args: unknown[]) => fetchResumes(...args),
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
];

describe("ApplicationLauncher", () => {
  beforeEach(() => {
    mockPush.mockReset();
    getCapabilities.mockReset();
    fetchResumes.mockReset();
    createApplicationRun.mockReset();
    overrideDuplicateRun.mockReset();
    getCapabilities.mockResolvedValue({ embeddedBrowser: true, platform: "linux" });
    fetchResumes.mockResolvedValue(resumes);
  });

  it("does not render Apply in Job Engine without a desktop bridge", async () => {
    getCapabilities.mockResolvedValue({ embeddedBrowser: false, platform: null });
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    await waitFor(() => {
      expect(getCapabilities).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /apply in job engine/i }),
    ).not.toBeInTheDocument();
  });

  it("does not render Apply in Job Engine for http application URLs", async () => {
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        title="Staff Engineer"
        company="Apex"
        applicationUrl="http://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );
    await waitFor(() => {
      expect(getCapabilities).toHaveBeenCalled();
    });
    expect(
      screen.queryByRole("button", { name: /apply in job engine/i }),
    ).not.toBeInTheDocument();
  });

  it("confirms job, resume, and manual-release behavior then creates a semi-auto run", async () => {
    createApplicationRun.mockResolvedValue({ id: RUN_ID });
    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );

    const launch = await screen.findByRole("button", { name: /apply in job engine/i });
    fireEvent.click(launch);

    const dialog = await screen.findByRole("dialog", {
      name: /start assisted application/i,
    });
    await screen.findByText(/Primary resume/);
    expect(dialog).toHaveTextContent("Staff Engineer");
    expect(dialog).toHaveTextContent("Apex");
    expect(dialog).toHaveTextContent("https://boards.greenhouse.io");
    expect(dialog).toHaveTextContent(/Primary resume/);
    expect(dialog).toHaveTextContent("cccccccc…cccc");
    expect(dialog).toHaveTextContent(/explicit/i);
    expect(dialog).toHaveTextContent(/submit application/i);
    expect(dialog).not.toHaveTextContent("FULL_AUTO");
    expect(dialog).not.toHaveTextContent("full_auto");

    fireEvent.click(
      screen.getByRole("button", { name: /start assisted application/i }),
    );

    await waitFor(() => {
      expect(createApplicationRun).toHaveBeenCalledWith({
        jobGroupId: JOB_ID,
        resumeId: "res_primary_pdf",
      });
      expect(mockPush).toHaveBeenCalledWith(`/applications/${RUN_ID}/workspace`);
    });
  });

  it("shows an existing run link and an explicit override, not an ordinary retry", async () => {
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
      id: RUN_ID,
    });

    renderWithProviders(
      <ApplicationLauncher
        jobGroupId={JOB_ID}
        title="Staff Engineer"
        company="Apex"
        applicationUrl="https://boards.greenhouse.io/apex/jobs/1"
        sourceName="Greenhouse"
      />,
    );

    fireEvent.click(await screen.findByRole("button", { name: /apply in job engine/i }));
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

    fireEvent.change(screen.getByLabelText(/override reason/i), {
      target: { value: "Previous attempt stalled" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: /override and create a new run/i }),
    );

    await waitFor(() => {
      expect(overrideDuplicateRun).toHaveBeenCalledWith(EXISTING_RUN_ID, {
        owner_confirmation: "Create a new assisted application run",
        reason: "Previous attempt stalled",
      });
      expect(createApplicationRun).toHaveBeenCalledTimes(2);
      expect(mockPush).toHaveBeenCalledWith(`/applications/${RUN_ID}/workspace`);
    });
  });
});
