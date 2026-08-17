import { describe, expect, it } from "vitest";
import { renderWithProviders, screen } from "@/test/render";
import { CatalogHealthNotice } from "./CatalogHealthNotice";
import type { CatalogHealth } from "../types";

describe("CatalogHealthNotice", () => {
  it("renders nothing when health is undefined or all sources are healthy", () => {
    const { container: c1 } = renderWithProviders(
      <CatalogHealthNotice health={undefined} />,
    );
    expect(c1).toBeEmptyDOMElement();

    const healthyCatalog: CatalogHealth = {
      catalog_last_seen_at: "2026-08-16T12:00:00Z",
      sources: [
        {
          source_id: "himalayas",
          latest_run_status: "success",
          latest_run_started_at: "2026-08-16T11:00:00Z",
          latest_run_completed_at: "2026-08-16T11:05:00Z",
          fetched_count: 50,
          accepted_count: 50,
          rejected_count: 0,
        },
        {
          source_id: "jobicy",
          latest_run_status: "success",
          latest_run_started_at: "2026-08-16T11:00:00Z",
          latest_run_completed_at: "2026-08-16T11:05:00Z",
          fetched_count: 30,
          accepted_count: 30,
          rejected_count: 0,
        },
      ],
    };

    const { container: c2 } = renderWithProviders(
      <CatalogHealthNotice health={healthyCatalog} />,
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it("renders informational notice when health data is unavailable (null)", () => {
    renderWithProviders(<CatalogHealthNotice health={null} />);

    expect(
      screen.getByText(/source status update unavailable/i),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/unable to verify real-time ingestion status/i),
    ).toBeInTheDocument();
  });

  it("renders warning banner when one or more sources failed", () => {
    const degradedCatalog: CatalogHealth = {
      catalog_last_seen_at: "2026-08-16T12:00:00Z",
      sources: [
        {
          source_id: "himalayas",
          latest_run_status: "success",
          latest_run_started_at: "2026-08-16T11:00:00Z",
          latest_run_completed_at: "2026-08-16T11:05:00Z",
          fetched_count: 50,
          accepted_count: 50,
          rejected_count: 0,
        },
        {
          source_id: "remoteok",
          latest_run_status: "failure",
          latest_run_started_at: "2026-08-16T11:00:00Z",
          latest_run_completed_at: "2026-08-16T11:01:00Z",
          fetched_count: 0,
          accepted_count: 0,
          rejected_count: 0,
        },
      ],
    };

    renderWithProviders(<CatalogHealthNotice health={degradedCatalog} />);

    expect(
      screen.getByRole("heading", {
        name: /catalog notice: partial source degraded/i,
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Remote OK")).toBeInTheDocument();
    expect(screen.getByText("Ingestion Failed")).toBeInTheDocument();
    expect(
      screen.getByText(
        /persisted records from active sources remain fully searchable/i,
      ),
    ).toBeInTheDocument();
  });
});
