import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { JobDetails } from "./JobDetails";
import type { JobDetail } from "../types";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

afterEach(() => {
  delete window.jobEngineDesktop;
});

const sampleJob: JobDetail = {
  id: "job-1234",
  title: "Senior Backend Developer",
  title_original: "Senior Backend Developer (Python/FastAPI)",
  company: "Acme Corp",
  company_original: "Acme Corporation Ltd",
  location_original: "Anywhere in Brazil",
  location_normalized_country: "Brazil",
  location_normalized_region: "South America",
  remote_status: "remote",
  location_eligibility: {
    unknown: false,
    regions: [
      {
        region: "brazil",
        evidence_text: "Explicitly hires developers living in Brazil",
      },
    ],
  },
  seniority: "senior",
  seniority_original: "Lead / Sr. Engineer",
  employment_type: "full_time",
  compensation: {
    original_text: "$100k - $120k USD",
    currency: "USD",
    period: "year",
    minimum: "100000",
    maximum: "120000",
    annual_usd_minimum: "100000",
    annual_usd_maximum: "120000",
  },
  technologies: [
    { term: "Python", source_text: "Python 3.12" },
    { term: "FastAPI", source_text: null },
    { term: "PostgreSQL", source_text: "Postgres 16" },
  ],
  role_families: ["backend", "python"],
  published_at: "2026-08-12T10:00:00Z",
  first_seen_at: "2026-08-12T11:00:00Z",
  last_seen_at: "2026-08-16T18:00:00Z",
  sources: [
    {
      source_id: "himalayas",
      source_name: "Himalayas",
      application_url: "https://himalayas.app/jobs/acme-senior-backend",
    },
  ],
  primary_application_url: "https://himalayas.app/jobs/acme-senior-backend",
  description:
    "We are looking for a Senior Backend Developer with strong Python skills.\n\nRequirements:\n- 5+ years experience\n- Strong SQL proficiency.",
  status: "active",
  closed_at: null,
  source_postings: [
    {
      id: "sp-1",
      source_id: "himalayas",
      source_posting_id: "him-123",
      source_name: "Himalayas",
      application_url: "https://himalayas.app/jobs/acme-senior-backend",
      title_original: "Senior Backend Developer (Python/FastAPI)",
      company_original: "Acme Corporation Ltd",
      description: "Himalayas description text",
      location_original: "Anywhere in Brazil",
      remote_status: "remote",
      employment_type: "full_time",
      seniority: "senior",
      seniority_original: "Lead / Sr. Engineer",
      compensation: {
        original_text: "$100k - $120k USD",
        currency: "USD",
        period: "year",
        minimum: "100000",
        maximum: "120000",
        annual_usd_minimum: "100000",
        annual_usd_maximum: "120000",
      },
      technologies_original_text: "Python, FastAPI, PostgreSQL",
      location_eligibility_evidence: "Open to Brazil",
      published_at: "2026-08-12T10:00:00Z",
      source_timestamp: "2026-08-12T10:00:00Z",
      first_seen_at: "2026-08-12T11:00:00Z",
      last_seen_at: "2026-08-16T18:00:00Z",
      closed_at: null,
      status: "active",
      adapter_version: "1.0.0",
      linked_at: "2026-08-12T11:00:00Z",
    },
  ],
};

describe("JobDetails", () => {
  it("renders canonical job information, titles, badges, and original transformation evidence", () => {
    renderWithProviders(<JobDetails job={sampleJob} />);

    // Header & Titles
    expect(
      screen.getByRole("heading", { name: "Senior Backend Developer" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/original title as posted/i),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText(/Senior Backend Developer \(Python\/FastAPI\)/)[0],
    ).toBeInTheDocument();
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
    expect(
      screen.getByText(/posted as: “Acme Corporation Ltd”/),
    ).toBeInTheDocument();

    // Badges
    expect(screen.getAllByText("Remote")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Senior")[0]).toBeInTheDocument();
    expect(screen.getAllByText("Full-time")[0]).toBeInTheDocument();
    expect(screen.getByText("Status: Active")).toBeInTheDocument();

    // Key details
    expect(
      screen.getAllByText(/Explicitly hires developers living in Brazil/)[0],
    ).toBeInTheDocument();
    expect(screen.getByText("Backend")).toBeInTheDocument();
    expect(screen.getAllByText("Python").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("FastAPI")).toBeInTheDocument();

    // Primary Apply Button
    expect(
      screen.getAllByRole("link", { name: /apply on himalayas/i })[0],
    ).toHaveAttribute("href", "https://himalayas.app/jobs/acme-senior-backend");

    // Description text is safely rendered
    expect(
      screen.getByText(/We are looking for a Senior Backend Developer/),
    ).toBeInTheDocument();
  });

  it("handles missing description and missing compensation truthfully without inventing copy", () => {
    const minimalJob: JobDetail = {
      ...sampleJob,
      title_original: sampleJob.title,
      company_original: sampleJob.company,
      description: null,
      compensation: {
        original_text: null,
        currency: null,
        period: null,
        minimum: null,
        maximum: null,
        annual_usd_minimum: null,
        annual_usd_maximum: null,
      },
      primary_application_url: null,
      technologies: [],
    };

    renderWithProviders(<JobDetails job={minimalJob} />);

    expect(
      screen.getByText(/compensation not provided/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/no full description was provided/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/application link unavailable/i),
    ).toBeInTheDocument();
  });

  it("offers Apply in Job Engine for https jobs when the desktop bridge is present", async () => {
    window.jobEngineDesktop = {
      getCapabilities: async () => ({ embeddedBrowser: true, platform: "linux" }),
      openApplication: async () => ({ success: true }),
      setApplicationBounds: async () => ({ success: true }),
      closeApplication: async () => ({ success: true }),
      goBack: async () => ({ success: true }),
      goForward: async () => ({ success: true }),
      reload: async () => ({ success: true }),
      subscribeBrowserState: () => () => {},
    };

    renderWithProviders(<JobDetails job={sampleJob} />);
    expect(
      await screen.findByRole("button", { name: /apply in job engine/i }),
    ).toBeInTheDocument();
  });
});
