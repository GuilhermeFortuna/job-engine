import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ApiNotFoundError,
  fetchApplicantProfile,
  fetchResumes,
} from "../api";
import { APPLICATION_READINESS_REFRESH_EVENT } from "../events";
import type { ApplicantProfile, SafeResume } from "../types";
import { useApplicationReadiness } from "./useApplicationReadiness";

vi.mock("../api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../api")>();
  return {
    ...actual,
    fetchApplicantProfile: vi.fn(),
    fetchResumes: vi.fn(),
  };
});

const profile = { id: "profile-1" } as ApplicantProfile;
const resume = {
  id: "asset-1",
  resume_id: "resume-1",
  label: "Primary",
  sha256: "abc",
  checksum_summary: "abc",
} as SafeResume;

describe("useApplicationReadiness", () => {
  beforeEach(() => {
    vi.mocked(fetchApplicantProfile).mockReset();
    vi.mocked(fetchResumes).mockReset();
  });

  it("loads a profile and path-free registered resumes", async () => {
    vi.mocked(fetchApplicantProfile).mockResolvedValue(profile);
    vi.mocked(fetchResumes).mockResolvedValue([resume]);

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      profile,
      resumes: [resume],
      isReady: true,
      error: null,
    });
    expect(result.current.resumes[0]).not.toHaveProperty(
      "source_markdown_path",
    );
    expect(result.current.resumes[0]).not.toHaveProperty("upload_pdf_path");
  });

  it("treats a missing profile as incomplete readiness, not a load error", async () => {
    vi.mocked(fetchApplicantProfile).mockRejectedValue(
      new ApiNotFoundError("Not Found"),
    );
    vi.mocked(fetchResumes).mockResolvedValue([resume]);

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current).toMatchObject({
      profile: null,
      resumes: [resume],
      isReady: false,
      error: null,
    });
  });

  it("requires at least one registered resume and exposes refresh", async () => {
    vi.mocked(fetchApplicantProfile).mockResolvedValue(profile);
    vi.mocked(fetchResumes)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([resume]);

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.isReady).toBe(false);

    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.isReady).toBe(true);
  });

  it("refreshes when settings announce a readiness change", async () => {
    vi.mocked(fetchApplicantProfile).mockResolvedValue(profile);
    vi.mocked(fetchResumes)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([resume]);
    const { result } = renderHook(() => useApplicationReadiness());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    act(() => {
      window.dispatchEvent(new Event(APPLICATION_READINESS_REFRESH_EVENT));
    });

    await waitFor(() => expect(result.current.isReady).toBe(true));
  });

  it("surfaces independent readiness request failures", async () => {
    vi.mocked(fetchApplicantProfile).mockResolvedValue(profile);
    vi.mocked(fetchResumes).mockRejectedValue(
      new Error("private resume service detail at /home/user/resume.pdf"),
    );

    const { result } = renderHook(() => useApplicationReadiness());

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.profile).toBe(profile);
    expect(result.current.resumes).toEqual([]);
    expect(result.current.isReady).toBe(false);
    expect(result.current.error).toBe("Unable to load application readiness.");
    expect(result.current.error).not.toContain("private");
    expect(result.current.error).not.toContain("/home/user");
  });
});
