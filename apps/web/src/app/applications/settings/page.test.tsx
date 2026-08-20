import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import ApplicationSettingsPage from "./page";

vi.mock(
  "@/features/applications/components/ApplicationSettings",
  () => ({
    ApplicationSettings: () => <div>Applicant settings controls</div>,
  }),
);

describe("Application settings route", () => {
  it("renders a thin accessible route shell", () => {
    renderWithProviders(<ApplicationSettingsPage />);
    expect(
      screen.getByRole("heading", { name: "Application settings", level: 1 }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /Applications/ }),
    ).toHaveAttribute("href", "/applications");
    expect(screen.getByText("Applicant settings controls")).toBeInTheDocument();
  });
});
