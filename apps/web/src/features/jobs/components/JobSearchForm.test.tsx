import { fireEvent } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { JobSearchForm } from "./JobSearchForm";
import { DEFAULT_SEARCH_PARAMS } from "../search-params";
import type { CatalogFilters } from "../types";
import { renderWithProviders, screen } from "@/test/render";

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

const mockCatalogFilters: CatalogFilters = {
  role_families: [
    { id: "software_developer", label: "Software developer" },
    { id: "backend", label: "Backend" },
  ],
  technologies: [
    { value: "Python", label: "Python" },
    { value: "React", label: "React" },
  ],
  remote_status: [
    { value: "remote", label: "Remote" },
    { value: "hybrid", label: "Hybrid" },
  ],
  location_eligibility: [
    { value: "brazil", label: "Brazil" },
    { value: "worldwide", label: "Worldwide" },
  ],
  seniority: [
    { value: "mid", label: "Mid" },
    { value: "senior", label: "Senior" },
  ],
  posted_within: [
    { value: "24h", label: "Past 24 hours" },
    { value: "7d", label: "Past 7 days" },
    { value: "any", label: "Any time" },
  ],
  sort: [
    { value: "newest", label: "Newest" },
    { value: "compensation_desc", label: "Compensation (high to low)" },
  ],
  sources: [
    { id: "himalayas", label: "Himalayas" },
    { id: "jobicy", label: "Jobicy" },
  ],
};

describe("JobSearchForm component", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("renders form controls in exact V1 order", () => {
    renderWithProviders(
      <JobSearchForm
        params={DEFAULT_SEARCH_PARAMS}
        catalogFilters={mockCatalogFilters}
      />,
    );

    expect(screen.getByText("Role Family")).toBeInTheDocument();
    // 3. Technologies
    expect(screen.getByText("Technologies")).toBeInTheDocument();
    // 4. Remote status
    expect(screen.getByText("Remote Arrangement")).toBeInTheDocument();
    // 5. Location eligibility
    expect(screen.getByText("Location Eligibility")).toBeInTheDocument();
    // 6. Seniority
    expect(screen.getByText("Seniority")).toBeInTheDocument();
    // 7. Compensation
    expect(screen.getByText("Compensation (USD/yr)")).toBeInTheDocument();
    // 8. Source
    expect(screen.getByText("Job Source")).toBeInTheDocument();
    // 9. Posted date
    expect(screen.getByLabelText("Posted Within")).toBeInTheDocument();
    // 10. Sort
    expect(screen.getByLabelText("Sort Order")).toBeInTheDocument();
  });

  it("toggles filter checkbox and navigates with repeated keys and page=1", () => {
    renderWithProviders(
      <JobSearchForm
        params={{
          ...DEFAULT_SEARCH_PARAMS,
          role_family: ["backend"],
          page: 2,
        }}
        catalogFilters={mockCatalogFilters}
      />,
    );

    const devCheckbox = screen.getByLabelText("Software developer");
    fireEvent.click(devCheckbox);

    expect(mockPush).toHaveBeenCalledWith(
      "/jobs?role_family=backend&role_family=software_developer",
    );
  });

  it("unchecking include_unknown_compensation serializes false", () => {
    renderWithProviders(
      <JobSearchForm
        params={DEFAULT_SEARCH_PARAMS}
        catalogFilters={mockCatalogFilters}
      />,
    );

    const unknownCompCheckbox = screen.getByLabelText(
      "Include jobs with unknown compensation",
    );
    expect(unknownCompCheckbox).toBeChecked();

    fireEvent.click(unknownCompCheckbox);

    expect(mockPush).toHaveBeenCalledWith(
      "/jobs?include_unknown_compensation=false",
    );
  });

  it("updates sort order and navigates with page=1", () => {
    renderWithProviders(
      <JobSearchForm
        params={{ ...DEFAULT_SEARCH_PARAMS, page: 4 }}
        catalogFilters={mockCatalogFilters}
      />,
    );

    const sortSelect = screen.getByLabelText("Sort Order");
    fireEvent.change(sortSelect, {
      target: { value: "compensation_desc" },
    });

    expect(mockPush).toHaveBeenCalledWith("/jobs?sort=compensation_desc");
  });
});
