import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiNotFoundError } from "@/features/profiles/api";
import { APPLICATION_READINESS_REFRESH_EVENT } from "../events";
import type { ApplicantProfile, ProfileResume } from "@/features/profiles/types";
import { useApplicationReadiness } from "./useApplicationReadiness";

const fetchActiveProfile = vi.fn();
const fetchProfileResumes = vi.fn();
const fetchLocalAiReadiness = vi.fn();
const getCapabilities = vi.fn();

vi.mock("@/features/profiles/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/features/profiles/api")>();
  return {
    ...actual,
    fetchActiveProfile: (...args: unknown[]) => fetchActiveProfile(...args),
    fetchProfileResumes: (...args: unknown[]) => fetchProfileResumes(...args),
    fetchLocalAiReadiness: (...args: unknown[]) => fetchLocalAiReadiness(...args),
  };
});

vi.mock("../desktop-bridge", () => ({
  getCapabilities: () => getCapabilities(),
  isProductionRuntimeReady: (capabilities: { productionRuntime: boolean }) =>
    capabilities.productionRuntime,
}));

const profile = {
  id: "profile-1",
  display_name: "Ada",
  first_name: { state: "provided", value: "Ada" },
  last_name: { state: "provided", value: "Lovelace" },
  email: { state: "provided", value: "ada@example.com" },
  work_authorizations: { state: "provided", value: [{ authorized: true }] },
  compensation_expectation: { state: "provided", value: { currency: "USD" } },
} as unknown as ApplicantProfile;

const resume = {
  id: "asset-1",
  resume_id: "resume-1",
  label: "Primary",
  sha256: "abc",
  checksum_summary: "abc",
  is_default: true,
  applicant_profile_id: "profile-1",
  managed_asset_id: "m1",
} as ProfileResume;

describe("useApplicationReadiness", () => {
  beforeEach(() => {
    fetchActiveProfile.mockReset();
    fetchProfileResumes.mockReset();
    fetchLocalAiReadiness.mockReset();
    getCapabilities.mockReset();
    getCapabilities.mockResolvedValue({ productionRuntime: true });
    fetchLocalAiReadiness.mockResolvedValue({
      local_ai_configured: true,
      local_ai_ready: true,
      local_ai_failure_code: null,
      model: "mock",
      last_self_test_passed: true,
      exceptions: [],
    });
  });

  it("loads profile-scoped resumes without path fields", async () => {
    fetchActiveProfile.mockResolvedValue(profile);
    fetchProfileResumes.mockResolvedValue([resume]);

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile?.id).toBe("profile-1");
    expect(result.current.resumes[0]).not.toHaveProperty("source_markdown_path");
    expect(result.current.readinessLabel).toBe("Ready for Auto Apply");
  });

  it("treats a missing profile as setup required, not a load error", async () => {
    fetchActiveProfile.mockRejectedValue(new ApiNotFoundError("Not Found"));

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile).toBeNull();
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.readinessLabel).toBe("Setup required");
  });

  it("refreshes when readiness events fire", async () => {
    fetchActiveProfile.mockResolvedValue(profile);
    fetchProfileResumes
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([resume]);

    const { result } = renderHook(() => useApplicationReadiness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.readinessLabel).toBe("Setup required");

    act(() => {
      window.dispatchEvent(new Event(APPLICATION_READINESS_REFRESH_EVENT));
    });

    await waitFor(() =>
      expect(result.current.readinessLabel).toBe("Ready for Auto Apply"),
    );
  });

  it("sanitizes resume load failures", async () => {
    fetchActiveProfile.mockResolvedValue(profile);
    fetchProfileResumes.mockRejectedValue(
      new Error("private resume service detail at /home/user/resume.pdf"),
    );

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe("Unable to load application readiness.");
    expect(result.current.error).not.toContain("private");
    expect(result.current.error).not.toContain("/home/user");
  });
});
