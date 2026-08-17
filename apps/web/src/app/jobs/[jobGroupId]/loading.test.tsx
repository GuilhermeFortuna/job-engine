import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import JobDetailLoading from "./loading";

describe("JobDetailLoading", () => {
  it("renders with role status and aria-busy=true", () => {
    renderWithProviders(<JobDetailLoading />);

    const statusEl = screen.getByRole("status");
    expect(statusEl).toBeInTheDocument();
    expect(statusEl).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByText(/loading job details\.\.\./i),
    ).toBeInTheDocument();
  });
});
