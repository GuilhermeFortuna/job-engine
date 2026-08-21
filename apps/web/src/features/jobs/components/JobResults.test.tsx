import { describe, expect, it, vi } from "vitest";
import { JobResults } from "./JobResults";
import { renderWithProviders, screen } from "@/test/render";
import type { JobListItem } from "../types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const sampleJob: JobListItem = {
  id: "22222222-2222-4222-8222-222222222222",
  title: "Frontend React Developer",
  title_original: "Frontend React Developer",
  company: "Globex Corp",
  company_original: "Globex",
  location_original: "Remote, Worldwide",
  location_normalized_country: null,
  location_normalized_region: "Worldwide",
  remote_status: "remote",
  location_eligibility: {
    unknown: false,
    regions: [{ region: "worldwide", evidence_text: "Anywhere" }],
  },
  seniority: "mid",
  seniority_original: "Mid",
  employment_type: "full_time",
  compensation: {
    original_text: "$100,000 / year",
    currency: "USD",
    period: "year",
    minimum: "100000",
    maximum: "100000",
    annual_usd_minimum: "100000",
    annual_usd_maximum: "100000",
  },
  technologies: [{ term: "React", source_text: "React" }],
  role_families: ["frontend"],
  published_at: "2026-08-16T10:00:00Z",
  first_seen_at: "2026-08-16T10:00:00Z",
  last_seen_at: "2026-08-17T00:00:00Z",
  sources: [
    {
      source_id: "himalayas",
      source_name: "Himalayas",
      listing_url: "https://himalayas.app/jobs/globex-fe",
      application_target: null,
    },
  ],
  preferred_application_target: {
    id: "target-1",
    target_url: "https://himalayas.app/jobs/globex-fe",
    listing_url: "https://himalayas.app/jobs/globex-fe",
    provider: null,
    desktop_adapter_id: null,
    status: "unresolved",
    resolution_method: null,
    verified_at: null,
    source_posting_id: null,
    assisted_reason: "No verified executable application target is available yet.",
  },
  description_excerpt: "Build accessible React applications.",
};

describe("JobResults component", () => {
  it("renders truthful empty results message when items is empty", () => {
    renderWithProviders(<JobResults items={[]} />);

    expect(
      screen.getByRole("heading", { name: "No matching jobs found" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/try adjusting your search keywords/i),
    ).toBeInTheDocument();
  });

  it("renders list of jobs when items has content", () => {
    renderWithProviders(<JobResults items={[sampleJob]} />);

    expect(
      screen.getByRole("heading", { name: "Frontend React Developer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Globex Corp")).toBeInTheDocument();
  });
});
