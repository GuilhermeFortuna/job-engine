import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiConflictError,
  createApplicationRun,
  fetchApplicantProfile,
  fetchResumes,
  overrideDuplicateRun,
} from "../api";
import { FULL_AUTO_MODE } from "../types";
import { useApplicationLaunch } from "./useApplicationLaunch";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    createApplicationRun: vi.fn(),
    fetchApplicantProfile: vi.fn(),
    fetchResumes: vi.fn(),
    overrideDuplicateRun: vi.fn(),
  };
});

vi.mock("../desktop-bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../desktop-bridge")>();
  return {
    ...actual,
    openApplicationView: vi.fn().mockResolvedValue({ success: true }),
  };
});

const selection = {
  resumeId: "resume-1",
  mode: FULL_AUTO_MODE,
};

describe("useApplicationLaunch transaction mutex", () => {
  beforeEach(() => {
    vi.mocked(createApplicationRun).mockReset();
    vi.mocked(fetchApplicantProfile).mockReset();
    vi.mocked(fetchResumes).mockReset();
    vi.mocked(overrideDuplicateRun).mockReset();
    vi.mocked(fetchApplicantProfile).mockResolvedValue({
      id: "profile-1",
    } as Awaited<ReturnType<typeof fetchApplicantProfile>>);
    vi.mocked(fetchResumes).mockResolvedValue([
      { resume_id: "resume-1" },
    ] as Awaited<ReturnType<typeof fetchResumes>>);
  });

  it("blocks two same-tick create transactions", async () => {
    vi.mocked(createApplicationRun).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useApplicationLaunch({
        jobGroupId: "job-1",
        refreshReadiness: vi.fn().mockResolvedValue(undefined),
      }),
    );

    act(() => {
      void result.current.start(selection);
      void result.current.start(selection);
    });

    await waitFor(() => expect(createApplicationRun).toHaveBeenCalled());
    expect(createApplicationRun).toHaveBeenCalledTimes(1);
    expect(fetchApplicantProfile).toHaveBeenCalledTimes(1);
  });

  it("blocks two same-tick duplicate override transactions", async () => {
    const conflict = new ApiConflictError("Conflict", {
      created_runs: [],
      conflicts: [
        {
          job_group_id: "job-1",
          canonical_application_url: "https://example.test/apply",
          existing_run_id: "run-existing",
          existing_status: "queued",
          message: "Existing run",
        },
      ],
    });
    vi.mocked(createApplicationRun).mockRejectedValueOnce(conflict);
    vi.mocked(overrideDuplicateRun).mockReturnValue(new Promise(() => {}));
    const { result } = renderHook(() =>
      useApplicationLaunch({
        jobGroupId: "job-1",
        refreshReadiness: vi.fn().mockResolvedValue(undefined),
      }),
    );
    await act(async () => {
      await result.current.start(selection);
    });

    act(() => {
      void result.current.confirmOverride("Owner confirmed duplicate");
      void result.current.confirmOverride("Owner confirmed duplicate");
    });

    await waitFor(() => expect(overrideDuplicateRun).toHaveBeenCalled());
    expect(overrideDuplicateRun).toHaveBeenCalledTimes(1);
  });
});
