import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import JobNotFound from "./not-found";

describe("JobNotFound", () => {
  it("renders 404 heading, message, and back to search link", () => {
    renderWithProviders(<JobNotFound />);

    expect(
      screen.getByRole("heading", { name: /job opportunity not found/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("link", { name: /back to job search/i }),
    ).toHaveAttribute("href", "/jobs");
  });
});
