import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import ApplicationsError from "./error";
import ApplicationsLoading from "./loading";
import ApplicationsPage from "./page";

vi.mock("@/features/applications/components/ApplicationReadinessSummary", () => ({
  ApplicationReadinessSummary: () => <div>Readiness summary</div>,
}));
vi.mock("@/features/applications/components/ApplicationsControlCenter", () => ({
  ApplicationsControlCenter: () => <div>Runs control center</div>,
}));

describe("Applications route", () => {
  it("renders the readiness summary and control center", () => {
    renderWithProviders(<ApplicationsPage />);
    expect(
      screen.getByRole("heading", { name: "Applications", level: 1 }),
    ).toBeInTheDocument();
    expect(screen.getByText("Readiness summary")).toBeInTheDocument();
    expect(screen.getByText("Runs control center")).toBeInTheDocument();
  });

  it("renders an accessible loading state", () => {
    renderWithProviders(<ApplicationsLoading />);
    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(status).toHaveTextContent("Loading applications");
  });

  it("renders a safe route error and retries without exposing raw exceptions", () => {
    const reset = vi.fn();
    renderWithProviders(
      <ApplicationsError
        error={new Error("secret provider payload at /home/user/resume.pdf")}
        reset={reset}
      />,
    );
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("Unable to load applications");
    expect(alert).not.toHaveTextContent("secret provider payload");
    fireEvent.click(screen.getByRole("button", { name: "Retry applications" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
