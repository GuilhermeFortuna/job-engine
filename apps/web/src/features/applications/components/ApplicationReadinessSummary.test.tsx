import { waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { ApplicationReadinessSummary } from "./ApplicationReadinessSummary";

const useApplicationReadiness = vi.fn();
vi.mock("../hooks/useApplicationReadiness", () => ({
  useApplicationReadiness: () => useApplicationReadiness(),
}));

const getCapabilities = vi.fn();
vi.mock("../desktop-bridge", () => ({
  getCapabilities: () => getCapabilities(),
  isProductionRuntimeReady: (capabilities: { productionRuntime: boolean }) =>
    capabilities.productionRuntime,
}));

describe("ApplicationReadinessSummary", () => {
  beforeEach(() => {
    useApplicationReadiness.mockReset();
    getCapabilities.mockReset();
    useApplicationReadiness.mockReturnValue({
      profile: { id: "profile-1" },
      resumes: [{ id: "resume-1", label: "Primary résumé" }],
      isReady: true,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    getCapabilities.mockResolvedValue({
      embeddedBrowser: true,
      platform: "linux",
      productionRuntime: true,
    });
  });

  it("summarizes profile, résumé, and production runtime readiness", async () => {
    renderWithProviders(<ApplicationReadinessSummary />);

    expect(
      screen.getByRole("region", { name: "Application readiness" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Profile complete")).toBeInTheDocument();
    expect(screen.getByText("1 registered résumé")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Production runtime available")).toBeInTheDocument();
    });
    expect(
      screen.getByRole("link", { name: "Application settings" }),
    ).toHaveAttribute("href", "/applications/settings");
  });

  it("identifies missing profile and résumé without exposing private values", async () => {
    useApplicationReadiness.mockReturnValue({
      profile: null,
      resumes: [],
      isReady: false,
      isLoading: false,
      error: null,
      refresh: vi.fn(),
    });
    getCapabilities.mockResolvedValue({
      embeddedBrowser: false,
      platform: null,
      productionRuntime: false,
    });

    renderWithProviders(<ApplicationReadinessSummary />);

    expect(screen.getByText("Profile setup required")).toBeInTheDocument();
    expect(screen.getByText("Résumé registration required")).toBeInTheDocument();
    await waitFor(() => {
      expect(
        screen.getByText("Open the desktop app to use the production runtime"),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText("profile-1")).not.toBeInTheDocument();
    expect(screen.queryByText("Primary résumé")).not.toBeInTheDocument();
  });

  it("shows readiness loading and API error states accessibly", () => {
    useApplicationReadiness.mockReturnValue({
      profile: null,
      resumes: [],
      isReady: false,
      isLoading: true,
      error: "Readiness service unavailable",
      refresh: vi.fn(),
    });

    renderWithProviders(<ApplicationReadinessSummary />);

    expect(screen.getByRole("status")).toHaveTextContent(
      "Checking application readiness",
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Unable to check application readiness",
    );
    expect(screen.getByRole("alert")).not.toHaveTextContent(
      "Readiness service unavailable",
    );
  });
});
