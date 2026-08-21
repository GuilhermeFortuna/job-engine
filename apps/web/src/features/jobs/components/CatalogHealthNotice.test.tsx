import { describe, expect, it, beforeEach } from "vitest";
import { fireEvent } from "@testing-library/react";
import { renderWithProviders, screen } from "@/test/render";
import { CatalogHealthNotice } from "./CatalogHealthNotice";
import type { CatalogHealth } from "../types";

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

describe("CatalogHealthNotice", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

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
    expect(
      screen.getByRole("button", { name: /dismiss catalog notice/i }),
    ).toBeInTheDocument();
  });

  it("renders warning banner when one or more sources failed", () => {
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
    expect(
      screen.getByRole("button", { name: /dismiss catalog notice/i }),
    ).toBeInTheDocument();
  });

  it("hides the notice after dismiss and keeps it hidden for the same health state", () => {
    const { unmount } = renderWithProviders(
      <CatalogHealthNotice health={degradedCatalog} />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: /dismiss catalog notice/i }),
    );

    expect(
      screen.queryByRole("heading", {
        name: /catalog notice: partial source degraded/i,
      }),
    ).not.toBeInTheDocument();

    unmount();
    const { container } = renderWithProviders(
      <CatalogHealthNotice health={degradedCatalog} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the notice again when the degraded health fingerprint changes", () => {
    const { rerender } = renderWithProviders(
      <CatalogHealthNotice health={degradedCatalog} />,
    );
    fireEvent.click(
      screen.getByRole("button", { name: /dismiss catalog notice/i }),
    );
    const updatedCatalog: CatalogHealth = {
      ...degradedCatalog,
      catalog_last_seen_at: "2026-08-17T12:00:00Z",
      sources: [
        ...degradedCatalog.sources,
        {
          source_id: "jobicy",
          latest_run_status: "failure",
          latest_run_started_at: "2026-08-17T11:00:00Z",
          latest_run_completed_at: "2026-08-17T11:01:00Z",
          fetched_count: 0,
          accepted_count: 0,
          rejected_count: 0,
        },
      ],
    };

    rerender(<CatalogHealthNotice health={updatedCatalog} />);
    expect(
      screen.getByRole("heading", {
        name: /catalog notice: partial source degraded/i,
      }),
    ).toBeInTheDocument();
  });
});
