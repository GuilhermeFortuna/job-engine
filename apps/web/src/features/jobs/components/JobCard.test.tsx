import { describe, expect, it } from "vitest";
import { JobCard, formatCompensation } from "./JobCard";
import { renderWithProviders, screen } from "@/test/render";
import type { JobListItem } from "../types";

const baseJob: JobListItem = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "Senior Backend Python Engineer",
  title_original: "Senior Backend Python Engineer",
  company: "Acme Cloud",
  company_original: "Acme Cloud Inc",
  location_original: "Remote, Brazil",
  location_normalized_country: "Brazil",
  location_normalized_region: "Latin America",
  remote_status: "remote",
  location_eligibility: {
    unknown: false,
    regions: [
      {
        region: "brazil",
        evidence_text: "Must reside in Brazil",
      },
    ],
  },
  seniority: "senior",
  seniority_original: "Senior Level",
  employment_type: "full_time",
  compensation: {
    original_text: "$120,000 - $140,000 / year",
    currency: "USD",
    period: "year",
    minimum: "120000",
    maximum: "140000",
    annual_usd_minimum: "120000",
    annual_usd_maximum: "140000",
  },
  technologies: [
    { term: "Python", source_text: "Python 3" },
    { term: "FastAPI", source_text: "FastAPI" },
    { term: "PostgreSQL", source_text: "Postgres" },
  ],
  role_families: ["backend", "python"],
  published_at: "2026-08-16T12:00:00Z",
  first_seen_at: "2026-08-16T12:00:00Z",
  last_seen_at: "2026-08-17T00:00:00Z",
  sources: [
    {
      source_id: "himalayas",
      source_name: "Himalayas",
      application_url: "https://himalayas.app/jobs/acme-backend",
    },
    {
      source_id: "jobicy",
      source_name: "Jobicy",
      application_url: "https://jobicy.com/jobs/acme-backend-2",
    },
  ],
  primary_application_url: "https://himalayas.app/jobs/acme-backend",
  description_excerpt: "Build high-throughput Python backends with FastAPI.",
};

describe("JobCard component", () => {
  it("renders canonical job title with link to detail route", () => {
    renderWithProviders(<JobCard job={baseJob} />);

    const link = screen.getByRole("link", {
      name: "Senior Backend Python Engineer",
    });
    expect(link).toHaveAttribute(
      "href",
      "/jobs/11111111-1111-4111-8111-111111111111",
    );
  });

  it("renders company, location, remote badge, seniority badge, and technologies", () => {
    renderWithProviders(<JobCard job={baseJob} />);

    expect(screen.getByText("Acme Cloud")).toBeInTheDocument();
    expect(screen.getByText("Remote, Brazil")).toBeInTheDocument();
    expect(screen.getByText("Remote")).toBeInTheDocument();
    expect(screen.getByText("Senior")).toBeInTheDocument();
    expect(screen.getByText("Python")).toBeInTheDocument();
    expect(screen.getByText("FastAPI")).toBeInTheDocument();
    expect(screen.getByText("PostgreSQL")).toBeInTheDocument();
    expect(
      screen.getByText("Build high-throughput Python backends with FastAPI."),
    ).toBeInTheDocument();
  });

  it("renders location eligibility with evidence text", () => {
    renderWithProviders(<JobCard job={baseJob} />);

    expect(
      screen.getByText("Eligible: Brazil (Must reside in Brazil)"),
    ).toBeInTheDocument();
  });

  it("renders 'Eligibility: Unknown' when location eligibility is unknown", () => {
    const unknownEligibilityJob: JobListItem = {
      ...baseJob,
      location_eligibility: {
        unknown: true,
        regions: [],
      },
    };

    renderWithProviders(<JobCard job={unknownEligibilityJob} />);
    expect(screen.getByText("Eligibility: Unknown")).toBeInTheDocument();
  });

  it("renders 'Compensation not provided' when original text is only a pay period", () => {
    const periodOnlyJob: JobListItem = {
      ...baseJob,
      compensation: {
        original_text: "year",
        currency: null,
        period: "year",
        minimum: null,
        maximum: null,
        annual_usd_minimum: null,
        annual_usd_maximum: null,
      },
    };

    renderWithProviders(<JobCard job={periodOnlyJob} />);
    expect(screen.getByText("Compensation not provided")).toBeInTheDocument();
    expect(screen.queryByText("year")).not.toBeInTheDocument();
  });

  it("renders description excerpts as plain text without HTML tags", () => {
    const htmlExcerptJob: JobListItem = {
      ...baseJob,
      description_excerpt:
        "<p>We are seeking a highly skilled and motivated <strong>Senior Software Engineer (React)</strong>.</p>",
    };

    renderWithProviders(<JobCard job={htmlExcerptJob} />);
    expect(
      screen.getByText(
        "We are seeking a highly skilled and motivated Senior Software Engineer (React).",
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/<p>/)).not.toBeInTheDocument();
    expect(screen.queryByText(/<strong>/)).not.toBeInTheDocument();
  });

  it("renders 'Compensation not provided' when compensation is missing or unknown", () => {
    const noCompJob: JobListItem = {
      ...baseJob,
      compensation: {
        original_text: null,
        currency: null,
        period: null,
        minimum: null,
        maximum: null,
        annual_usd_minimum: null,
        annual_usd_maximum: null,
      },
    };

    renderWithProviders(<JobCard job={noCompJob} />);
    expect(screen.getByText("Compensation not provided")).toBeInTheDocument();
    expect(screen.queryByText("$0")).not.toBeInTheDocument();
  });

  it("treats period-only original compensation text as unknown", () => {
    expect(
      formatCompensation({
        original_text: "USD year",
        currency: "USD",
        period: "year",
        minimum: null,
        maximum: null,
        annual_usd_minimum: null,
        annual_usd_maximum: null,
      }),
    ).toBe("Compensation not provided");
  });

  it("renders both original compensation text and normalized annual USD when provided", () => {
    const diffCompJob: JobListItem = {
      ...baseJob,
      compensation: {
        original_text: "R$ 30,000 / month",
        currency: "BRL",
        period: "month",
        minimum: "30000",
        maximum: "30000",
        annual_usd_minimum: "72000",
        annual_usd_maximum: "72000",
      },
    };

    renderWithProviders(<JobCard job={diffCompJob} />);
    expect(
      screen.getByText(/R\$ 30,000 \/ month \(~\$72,000\/yr\)/),
    ).toBeInTheDocument();
  });

  it("renders grouped source provenance badges and primary apply link with safe attributes", () => {
    renderWithProviders(<JobCard job={baseJob} />);

    expect(screen.getByText("Himalayas")).toBeInTheDocument();
    expect(screen.getByText("Jobicy")).toBeInTheDocument();

    const applyBtn = screen.getByRole("link", {
      name: /apply on himalayas/i,
    });
    expect(applyBtn).toHaveAttribute(
      "href",
      "https://himalayas.app/jobs/acme-backend",
    );
    expect(applyBtn).toHaveAttribute("target", "_blank");
    expect(applyBtn).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("renders semantic <time> elements for posted and last seen dates", () => {
    renderWithProviders(<JobCard job={baseJob} />);

    const timeElements = screen.getAllByText(/\d{4}-\d{2}-\d{2}/);
    expect(timeElements.length).toBeGreaterThanOrEqual(2);
  });
});
