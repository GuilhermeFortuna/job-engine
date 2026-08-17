import { describe, expect, it, vi } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "@/test/render";
import JobDetailError from "./error";

describe("JobDetailError", () => {
  it("renders role alert, error details, and guidance", () => {
    renderWithProviders(
      <JobDetailError
        error={new Error("Backend service unavailable")}
        reset={() => {}}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /unable to load job details/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Backend service unavailable"),
    ).toBeInTheDocument();
  });

  it("calls reset when Retry button is clicked", () => {
    const handleReset = vi.fn();
    renderWithProviders(
      <JobDetailError
        error={new Error("Network timeout")}
        reset={handleReset}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    expect(handleReset).toHaveBeenCalledTimes(1);
  });
});
