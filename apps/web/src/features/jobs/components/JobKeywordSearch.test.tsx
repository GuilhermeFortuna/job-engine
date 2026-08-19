import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobKeywordSearch } from "./JobKeywordSearch";
import { DEFAULT_SEARCH_PARAMS } from "../search-params";
import { renderWithProviders, screen } from "@/test/render";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

describe("JobKeywordSearch", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("submits keyword on form submission and resets page to 1", () => {
    renderWithProviders(
      <JobKeywordSearch params={{ ...DEFAULT_SEARCH_PARAMS, page: 3 }} />,
    );

    const input = screen.getByLabelText("Keywords");
    fireEvent.change(input, { target: { value: "Full Stack" } });

    const submitBtn = screen.getByRole("button", { name: "Search" });
    fireEvent.click(submitBtn);

    expect(mockPush).toHaveBeenCalledWith("/jobs?q=Full+Stack");
  });
});
