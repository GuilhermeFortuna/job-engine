import { act, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { renderWithProviders, screen } from "@/test/render";
import type { ProfileResume } from "../types";
import { ResumeDocumentManager } from "./ResumeDocumentManager";

const resume: ProfileResume = {
  id: "asset-1",
  resume_id: "res-1",
  label: "Default resume",
  sha256: "abc",
  checksum_summary: "abc",
  language: "en",
  is_default: true,
  file_size_bytes: 1024,
  last_verified_at: null,
  version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  applicant_profile_id: "profile-1",
  managed_asset_id: "asset-1",
};

vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    fetchProfileResumes: vi.fn(),
  };
});

import { fetchProfileResumes } from "../api";

describe("ResumeDocumentManager", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("loads resumes once even when parent onChanged is unstable and updates state", async () => {
    const fetchMock = vi.mocked(fetchProfileResumes);
    fetchMock.mockImplementation(
      () =>
        new Promise<ProfileResume[]>((resolve) => {
          setTimeout(() => resolve([resume]), 5);
        }),
    );

    function Harness() {
      const [, setResumes] = useState<ProfileResume[]>([]);
      return (
        <ResumeDocumentManager
          profileId="profile-1"
          scopeKey={1}
          onChanged={(items) => {
            setResumes(items);
          }}
        />
      );
    }

    renderWithProviders(<Harness />);

    await waitFor(() => {
      expect(screen.getByText("Default resume")).toBeInTheDocument();
    });
    expect(screen.queryByText("Loading resumes…")).not.toBeInTheDocument();

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
