import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ActiveFilters } from "./ActiveFilters";
import { DEFAULT_SEARCH_PARAMS } from "../search-params";
import type { CatalogFilters, JobSearchParams } from "../types";
import { renderWithProviders, screen } from "@/test/render";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockCatalogFilters: CatalogFilters = {
  role_families: [
    { id: "backend", label: "Backend" },
    { id: "python", label: "Python" },
  ],
  technologies: [
    { value: "Python", label: "Python" },
    { value: "FastAPI", label: "FastAPI" },
  ],
  remote_status: [{ value: "remote", label: "Remote" }],
  location_eligibility: [{ value: "brazil", label: "Brazil" }],
  seniority: [{ value: "senior", label: "Senior" }],
  posted_within: [{ value: "7d", label: "Past 7 days" }],
  sort: [{ value: "compensation_desc", label: "Compensation (high to low)" }],
  sources: [{ id: "himalayas", label: "Himalayas" }],
};

describe("ActiveFilters component", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("returns null when no active filters are set", () => {
    const { container } = renderWithProviders(
      <ActiveFilters
        params={DEFAULT_SEARCH_PARAMS}
        catalogFilters={mockCatalogFilters}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("renders active filter chips for all categories", () => {
    const activeParams: JobSearchParams = {
      q: "fastapi",
      role_family: ["backend"],
      technology: ["Python"],
      remote_status: ["remote"],
      location_eligibility: ["brazil"],
      seniority: ["senior"],
      source: ["himalayas"],
      minimum_annual_usd: 120000,
      include_unknown_compensation: false,
      posted_within: "7d",
      sort: "compensation_desc",
      page: 2,
      page_size: 25,
    };

    renderWithProviders(
      <ActiveFilters
        params={activeParams}
        catalogFilters={mockCatalogFilters}
      />,
    );

    expect(screen.getByText('Keyword: "fastapi"')).toBeInTheDocument();
    expect(screen.getByText("Role: Backend")).toBeInTheDocument();
    expect(screen.getByText("Tech: Python")).toBeInTheDocument();
    expect(screen.getByText("Remote: Remote")).toBeInTheDocument();
    expect(screen.getByText("Location: Brazil")).toBeInTheDocument();
    expect(screen.getByText("Seniority: Senior")).toBeInTheDocument();
    expect(screen.getByText("Source: Himalayas")).toBeInTheDocument();
    expect(screen.getByText("Min Comp: $120,000/yr")).toBeInTheDocument();
    expect(screen.getByText("Exclude Unknown Comp")).toBeInTheDocument();
    expect(screen.getByText("Posted: Past 7 days")).toBeInTheDocument();
    expect(
      screen.getByText("Sort: Compensation (high to low)"),
    ).toBeInTheDocument();
  });

  it("removes single filter and resets page to 1", () => {
    const activeParams: JobSearchParams = {
      ...DEFAULT_SEARCH_PARAMS,
      q: "fastapi",
      role_family: ["backend"],
      page: 3,
    };

    renderWithProviders(
      <ActiveFilters
        params={activeParams}
        catalogFilters={mockCatalogFilters}
      />,
    );

    const removeKeywordBtn = screen.getByRole("button", {
      name: 'Remove filter Keyword: "fastapi"',
    });
    fireEvent.click(removeKeywordBtn);

    expect(mockPush).toHaveBeenCalledWith("/jobs?role_family=backend");
  });

  it("clears all filters on 'Clear all' click", () => {
    const activeParams: JobSearchParams = {
      ...DEFAULT_SEARCH_PARAMS,
      q: "python",
      role_family: ["backend"],
    };

    renderWithProviders(
      <ActiveFilters
        params={activeParams}
        catalogFilters={mockCatalogFilters}
      />,
    );

    const clearAllBtn = screen.getByRole("button", { name: /clear all/i });
    fireEvent.click(clearAllBtn);

    expect(mockPush).toHaveBeenCalledWith("/jobs");
  });
});
