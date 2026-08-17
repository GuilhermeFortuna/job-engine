import { describe, expect, it } from "vitest";
import JobsLoading from "./loading";
import { renderWithProviders, screen } from "@/test/render";

describe("JobsLoading component", () => {
  it("renders accessible loading status with aria-busy", () => {
    renderWithProviders(<JobsLoading />);

    const status = screen.getByRole("status");
    expect(status).toHaveAttribute("aria-busy", "true");
    expect(status).toHaveAttribute("aria-live", "polite");
    expect(
      screen.getByText("Loading job opportunities..."),
    ).toBeInTheDocument();
  });
});
