import { describe, expect, it, vi } from "vitest";
import JobsPage from "./page";
import * as api from "@/features/jobs/api";
import type { CatalogFilters, JobSearchResponse } from "@/features/jobs/types";
import { renderWithProviders, screen } from "@/test/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}));

const mockFilters: CatalogFilters = {
  role_families: [
    { id: "software_developer", label: "Software developer" },
    { id: "backend", label: "Backend" },
  ],
  technologies: [{ value: "Python", label: "Python" }],
  remote_status: [{ value: "remote", label: "Remote" }],
  location_eligibility: [{ value: "brazil", label: "Brazil" }],
  seniority: [{ value: "senior", label: "Senior" }],
  posted_within: [{ value: "any", label: "Any time" }],
  sort: [{ value: "newest", label: "Newest" }],
  sources: [{ id: "himalayas", label: "Himalayas" }],
};

const mockSearchResponse: JobSearchResponse = {
  items: [
    {
      id: "33333333-3333-4333-8333-333333333333",
      title: "Backend Engineer",
      title_original: "Backend Engineer",
      company: "Acme",
      company_original: "Acme",
      location_original: "Remote, Brazil",
      location_normalized_country: "Brazil",
      location_normalized_region: "Latin America",
      remote_status: "remote",
      location_eligibility: {
        unknown: false,
        regions: [{ region: "brazil", evidence_text: "Brazil only" }],
      },
      seniority: "senior",
      seniority_original: "Senior",
      employment_type: "full_time",
      compensation: {
        original_text: "$110,000 / year",
        currency: "USD",
        period: "year",
        minimum: "110000",
        maximum: "110000",
        annual_usd_minimum: "110000",
        annual_usd_maximum: "110000",
      },
      technologies: [{ term: "Python", source_text: "Python" }],
      role_families: ["backend"],
      published_at: "2026-08-16T12:00:00Z",
      first_seen_at: "2026-08-16T12:00:00Z",
      last_seen_at: "2026-08-17T00:00:00Z",
      sources: [
        {
          source_id: "himalayas",
          source_name: "Himalayas",
          listing_url: "https://himalayas.app/jobs/acme",
          application_target: null,
        },
      ],
      preferred_application_target: {
    id: "target-1",
    target_url: "https://himalayas.app/jobs/acme",
    listing_url: "https://himalayas.app/jobs/acme",
    provider: null,
    desktop_adapter_id: null,
    status: "unresolved",
    resolution_method: null,
    verified_at: null,
    source_posting_id: null,
    assisted_reason: "No verified executable application target is available yet.",
  },
      description_excerpt: "Backend engineering with Python.",
    },
  ],
  page: 1,
  page_size: 25,
  total: 1,
  total_pages: 1,
};

describe("JobsPage Server Component", () => {
  it("renders page title, search form, status, active filters, and job results", async () => {
    vi.spyOn(api, "fetchCatalogFilters").mockResolvedValue(mockFilters);
    vi.spyOn(api, "fetchCatalogHealth").mockResolvedValue({
      catalog_last_seen_at: "2026-08-16T12:00:00Z",
      sources: [],
    });
    vi.spyOn(api, "searchJobs").mockResolvedValue(mockSearchResponse);

    const jsx = await JobsPage({
      searchParams: Promise.resolve({ q: "backend" }),
    });
    renderWithProviders(jsx);

    expect(
      screen.getByRole("heading", {
        level: 1,
        name: "Looking for a new job?",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Showing 1–1 of 1 jobs")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 2, name: "Backend Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
});
