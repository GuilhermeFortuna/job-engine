import type { CatalogHealth, LatestRunStatus, SourceHealth } from "../types";
import { formatDate } from "./JobCard";

export function formatRunStatus(status: LatestRunStatus): string {
  switch (status) {
    case "failure":
      return "Ingestion Failed";
    case "partial_success":
      return "Partial Success";
    case "running":
      return "Ingestion in Progress";
    case "never_run":
      return "Not Yet Ingested";
    case "success":
      return "Operational";
    default:
      return status;
  }
}

export function sourceDisplayName(sourceId: string): string {
  switch (sourceId) {
    case "himalayas":
      return "Himalayas";
    case "jobicy":
      return "Jobicy";
    case "remoteok":
      return "Remote OK";
    default:
      return sourceId;
  }
}

export function CatalogHealthNotice({
  health,
}: {
  health?: CatalogHealth | null;
}) {
  if (health === undefined) {
    return null;
  }

  if (health === null) {
    return (
      <aside
        role="status"
        aria-live="polite"
        className="catalog-health-notice notice-info"
      >
        <div className="notice-icon" aria-hidden="true">
          ℹ️
        </div>
        <div className="notice-content">
          <p className="notice-title">Source Status Update Unavailable</p>
          <p className="notice-message">
            Unable to verify real-time ingestion status. Search results reflect current persisted catalog records.
          </p>
        </div>
      </aside>
    );
  }

  const degradedSources: SourceHealth[] = (health.sources || []).filter(
    (s) =>
      s.latest_run_status === "failure" ||
      s.latest_run_status === "partial_success" ||
      s.latest_run_status === "never_run",
  );

  if (degradedSources.length === 0) {
    return null;
  }

  const catalogFreshness = health.catalog_last_seen_at
    ? formatDate(health.catalog_last_seen_at)
    : "recently";

  return (
    <aside
      role="status"
      aria-live="polite"
      className="catalog-health-notice notice-warning"
      aria-labelledby="health-notice-heading"
    >
      <div className="notice-icon" aria-hidden="true">
        ⚠️
      </div>
      <div className="notice-content">
        <h2 id="health-notice-heading" className="notice-title">
          Catalog Notice: Partial Source Degraded
        </h2>
        <p className="notice-message">
          One or more job sources encountered synchronization issues during their latest ingestion run.
          Persisted records from active sources remain fully searchable, but catalog completeness may be temporarily affected.
        </p>

        <ul className="notice-sources-list" aria-label="Affected sources">
          {degradedSources.map((s) => (
            <li key={s.source_id} className="notice-source-item">
              <strong>{sourceDisplayName(s.source_id)}</strong>:{" "}
              <span className={`status-tag status-${s.latest_run_status}`}>
                {formatRunStatus(s.latest_run_status)}
              </span>
              {s.latest_run_completed_at && (
                <span className="notice-source-date">
                  {" "}(last run: {formatDate(s.latest_run_completed_at)})
                </span>
              )}
            </li>
          ))}
        </ul>

        {health.catalog_last_seen_at && (
          <p className="notice-freshness">
            Latest catalog update: <time dateTime={health.catalog_last_seen_at}>{catalogFreshness}</time>
          </p>
        )}
      </div>
    </aside>
  );
}
