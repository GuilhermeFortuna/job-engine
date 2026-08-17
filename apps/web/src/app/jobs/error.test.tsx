import { fireEvent } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import JobsError from "./error";
import { renderWithProviders, screen } from "@/test/render";

describe("JobsError component", () => {
  it("renders role='alert', error message, and guidance", () => {
    const error = new Error("Failed to connect to backend");
    const reset = vi.fn();

    renderWithProviders(<JobsError error={error} reset={reset} />);

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Unable to Load Jobs")).toBeInTheDocument();
    expect(
      screen.getByText("Failed to connect to backend"),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: "Reset to default search" }),
    ).toHaveAttribute("href", "/jobs");
  });

  it("calls reset when Retry button is clicked", () => {
    const error = new Error("Network timeout");
    const reset = vi.fn();

    renderWithProviders(<JobsError error={error} reset={reset} />);

    const retryBtn = screen.getByRole("button", { name: "Retry search" });
    fireEvent.click(retryBtn);

    expect(reset).toHaveBeenCalledTimes(1);
  });
});
