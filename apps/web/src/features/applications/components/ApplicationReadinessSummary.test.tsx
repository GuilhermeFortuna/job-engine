import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationReadinessSummary } from "./ApplicationReadinessSummary";

const useApplicationReadiness = vi.fn();
vi.mock("../hooks/useApplicationReadiness", () => ({
  useApplicationReadiness: () => useApplicationReadiness(),
}));

describe("ApplicationReadinessSummary", () => {
  beforeEach(() => {
    useApplicationReadiness.mockReset();
    useApplicationReadiness.mockReturnValue({
      profile: { id: "profile-1" },
      resumes: [{ id: "resume-1", label: "Primary résumé" }],
      isReady: true,
      readinessLabel: "Ready for Auto Apply",
      productReadiness: {
        label: "Ready for Auto Apply",
        blockers: [],
        exceptions: [],
        actions: [],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
  });

  it("shows the product readiness label and Profile link", () => {
    renderWithProviders(<ApplicationReadinessSummary />);

    expect(
      screen.getByRole("region", { name: "Application readiness" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Ready for Auto Apply")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Open Profile" })).toHaveAttribute(
      "href",
      "/profile",
    );
  });

  it("lists blockers without exposing private values", () => {
    useApplicationReadiness.mockReturnValue({
      profile: null,
      resumes: [],
      isReady: false,
      readinessLabel: "Setup required",
      productReadiness: {
        label: "Setup required",
        blockers: ["Create an applicant profile", "Upload a default resume"],
        exceptions: [],
        actions: [],
      },
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });

    renderWithProviders(<ApplicationReadinessSummary />);

    expect(screen.getByText("Setup required")).toBeInTheDocument();
    expect(screen.getByText("Create an applicant profile")).toBeInTheDocument();
    expect(screen.queryByText("profile-1")).not.toBeInTheDocument();
  });

  it("shows readiness loading and API error states accessibly", () => {
    useApplicationReadiness.mockReturnValue({
      profile: null,
      resumes: [],
      isReady: false,
      readinessLabel: "Setup required",
      productReadiness: {
        label: "Setup required",
        blockers: [],
        exceptions: [],
        actions: [],
      },
      isLoading: true,
      error: "Readiness service unavailable",
      refresh: vi.fn(),
    });

    renderWithProviders(<ApplicationReadinessSummary />);

    expect(
      screen.getByText("Checking application readiness"),
    ).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to check application readiness",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Readiness service unavailable",
    );
  });
});
