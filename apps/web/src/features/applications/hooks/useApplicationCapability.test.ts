import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useApplicationCapability } from "./useApplicationCapability";

const useApplicationReadiness = vi.fn();
const useDesktopCapability = vi.fn();

vi.mock("./useApplicationReadiness", () => ({
  useApplicationReadiness: () => useApplicationReadiness(),
}));

vi.mock("./useDesktopCapability", () => ({
  useDesktopCapability: () => useDesktopCapability(),
}));

describe("useApplicationCapability", () => {
  beforeEach(() => {
    useApplicationReadiness.mockReturnValue({
      profile: { id: "profile-1" },
      resumes: [{ id: "resume-1" }],
      isReady: true,
      isLoading: false,
      error: null,
      revision: 4,
      refresh: vi.fn(),
    });
    useDesktopCapability.mockReturnValue({
      capabilities: {
        embeddedBrowser: true,
        platform: "linux",
        productionRuntime: true,
      },
      isLoading: false,
      revision: 7,
    });
  });

  it("keeps a stable explicit identity until a resolver input changes", () => {
    const { result, rerender } = renderHook(
      ({
        applicationUrl,
        providerTier,
      }: {
        applicationUrl: string;
        providerTier: "measured" | "unmeasured";
      }) => useApplicationCapability(applicationUrl, providerTier),
      {
        initialProps: {
          applicationUrl: "https://boards.greenhouse.io/apex/jobs/1",
          providerTier: "unmeasured",
        },
      },
    );
    const assistedIdentity = result.current.confirmationIdentity;
    expect(assistedIdentity).toMatchObject({
      applicationUrl: "https://boards.greenhouse.io/apex/jobs/1",
      providerTier: "unmeasured",
      readinessRevision: 4,
      desktopRevision: 7,
      productionRuntimeAvailable: true,
      profileExists: true,
      registeredResumeExists: true,
    });

    rerender({
      applicationUrl: "https://boards.greenhouse.io/apex/jobs/1",
      providerTier: "unmeasured",
    });
    expect(result.current.confirmationIdentity).toBe(assistedIdentity);

    rerender({
      applicationUrl: "https://boards.greenhouse.io/apex/jobs/1",
      providerTier: "measured",
    });
    const automaticIdentity = result.current.confirmationIdentity;
    expect(automaticIdentity).not.toBe(assistedIdentity);

    rerender({
      applicationUrl: "https://jobs.lever.co/apex/2",
      providerTier: "measured",
    });
    expect(result.current.confirmationIdentity).not.toBe(automaticIdentity);
  });
});
