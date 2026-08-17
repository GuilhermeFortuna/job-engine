import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import * as api from "@/features/jobs/api";
import JobPage, { generateMetadata } from "./page";
import type { JobDetail } from "@/features/jobs/types";

const mockJob: JobDetail = {
  id: "test-uuid-1",
  title: "Full Stack Engineer",
  title_original: "Full Stack Engineer",
  company: "Startup Co",
  company_original: "Startup Co",
  location_original: null,
  location_normalized_country: "Brazil",
  location_normalized_region: "Latin America",
  remote_status: "remote",
  location_eligibility: { unknown: false, regions: [] },
  seniority: "mid",
  seniority_original: null,
  employment_type: "full_time",
  compensation: {
    original_text: null,
    currency: null,
    period: null,
    minimum: null,
    maximum: null,
    annual_usd_minimum: null,
    annual_usd_maximum: null,
  },
  technologies: [],
  role_families: ["full_stack"],
  published_at: null,
  first_seen_at: "2026-08-16T12:00:00Z",
  last_seen_at: "2026-08-16T12:00:00Z",
  sources: [],
  primary_application_url: null,
  description: "Test description",
  status: "active",
  closed_at: null,
  source_postings: [],
};

describe("JobPage Server Component", () => {
  it("fetches and renders job details for a valid UUID", async () => {
    vi.spyOn(api, "fetchJobDetail").mockResolvedValueOnce(mockJob);

    const pageElement = await JobPage({
      params: Promise.resolve({ jobGroupId: "test-uuid-1" }),
    });

    render(pageElement);

    expect(
      screen.getByRole("heading", { name: "Full Stack Engineer" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Startup Co")).toBeInTheDocument();
  });

  it("generates page metadata from job title and company", async () => {
    vi.spyOn(api, "fetchJobDetail").mockResolvedValueOnce(mockJob);

    const meta = await generateMetadata({
      params: Promise.resolve({ jobGroupId: "test-uuid-1" }),
    });

    expect(meta.title).toBe("Full Stack Engineer at Startup Co - Job Engine");
  });
});
