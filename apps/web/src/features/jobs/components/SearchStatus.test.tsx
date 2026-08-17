import { describe, expect, it } from "vitest";
import { SearchStatus } from "./SearchStatus";
import { renderWithProviders, screen } from "@/test/render";

describe("SearchStatus component", () => {
  it("renders '0 jobs found' when total is 0", () => {
    renderWithProviders(<SearchStatus total={0} page={1} pageSize={25} />);

    const status = screen.getByRole("status");
    expect(status).toHaveTextContent("0 jobs found");
    expect(status).toHaveAttribute("aria-live", "polite");
  });

  it("renders correct range for single-page result", () => {
    renderWithProviders(<SearchStatus total={8} page={1} pageSize={25} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1–8 of 8 jobs");
  });

  it("renders correct range for first page of multi-page results", () => {
    renderWithProviders(<SearchStatus total={42} page={1} pageSize={25} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1–25 of 42 jobs");
  });

  it("renders correct range for second page of multi-page results", () => {
    renderWithProviders(<SearchStatus total={42} page={2} pageSize={25} />);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 26–42 of 42 jobs");
  });

  it("renders truthful message when page is beyond total pages", () => {
    renderWithProviders(<SearchStatus total={10} page={5} pageSize={25} />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Page 5 is beyond available results (10 total jobs)",
    );
  });
});
