import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { SourcePostingList } from "./SourcePostingList";
import type { SourcePostingDetail } from "../types";

const mockPostings: SourcePostingDetail[] = [
  {
    id: "sp-1",
    source_id: "himalayas",
    source_posting_id: "him-999",
    source_name: "Himalayas",
    application_url: "https://himalayas.app/jobs/senior-python",
    title_original: "Senior Python Backend Engineer",
    company_original: "Tech Global Inc",
    description: "Full job description from Himalayas",
    location_original: "Worldwide Remote",
    remote_status: "remote",
    employment_type: "full_time",
    seniority: "senior",
    seniority_original: "Senior Level",
    compensation: {
      original_text: "$120,000 - $150,000 USD",
      currency: "USD",
      period: "year",
      minimum: "120000",
      maximum: "150000",
      annual_usd_minimum: "120000",
      annual_usd_maximum: "150000",
    },
    technologies_original_text: "Python, FastAPI, Postgres, Docker",
    location_eligibility_evidence: "Open worldwide to any location",
    published_at: "2026-08-10T12:00:00Z",
    source_timestamp: "2026-08-10T12:00:00Z",
    first_seen_at: "2026-08-10T14:00:00Z",
    last_seen_at: "2026-08-16T18:00:00Z",
    closed_at: null,
    status: "active",
    adapter_version: "1.0.0",
    linked_at: "2026-08-10T14:00:00Z",
  },
  {
    id: "sp-2",
    source_id: "remoteok",
    source_posting_id: "rok-555",
    source_name: "Remote OK",
    application_url: "https://remoteok.com/l/555",
    title_original: "Senior Python Developer",
    company_original: "Tech Global Inc",
    description: "Remote OK posting text",
    location_original: "Anywhere",
    remote_status: "remote",
    employment_type: "full_time",
    seniority: "senior",
    seniority_original: null,
    compensation: {
      original_text: null,
      currency: null,
      period: null,
      minimum: null,
      maximum: null,
      annual_usd_minimum: null,
      annual_usd_maximum: null,
    },
    technologies_original_text: "Python, SQL",
    location_eligibility_evidence: null,
    published_at: "2026-08-11T09:00:00Z",
    source_timestamp: "2026-08-11T09:00:00Z",
    first_seen_at: "2026-08-11T10:00:00Z",
    last_seen_at: "2026-08-16T18:00:00Z",
    closed_at: null,
    status: "active",
    adapter_version: "1.2.0",
    linked_at: "2026-08-11T10:00:00Z",
  },
];

describe("SourcePostingList", () => {
  it("renders empty state message when no postings are linked", () => {
    renderWithProviders(<SourcePostingList postings={[]} />);
    expect(
      screen.getByText(/no source postings linked to this record/i),
    ).toBeInTheDocument();
  });

  it("renders provenance list with all source postings and audit data", () => {
    renderWithProviders(<SourcePostingList postings={mockPostings} />);

    expect(
      screen.getByRole("heading", {
        name: /source provenance & postings \(2\)/i,
      }),
    ).toBeInTheDocument();

    // Source 1 check
    expect(screen.getByText("him-999")).toBeInTheDocument();
    expect(screen.getAllByText("Tech Global Inc")).toHaveLength(2);
    expect(
      screen.getByText(/senior level/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/python, fastapi, postgres, docker/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Adapter: v1.0.0")).toBeInTheDocument();

    // Source 2 check
    expect(screen.getByText("rok-555")).toBeInTheDocument();
    expect(screen.getByText("Adapter: v1.2.0")).toBeInTheDocument();

    // Links check
    expect(
      screen.getByRole("link", { name: /apply on himalayas/i }),
    ).toHaveAttribute("href", "https://himalayas.app/jobs/senior-python");
    expect(
      screen.getByRole("link", { name: /apply on remote ok/i }),
    ).toHaveAttribute("href", "https://remoteok.com/l/555");
  });
});
