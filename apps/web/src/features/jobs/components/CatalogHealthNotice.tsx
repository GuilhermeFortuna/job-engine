import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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

function statusVariant(
  status: LatestRunStatus,
): "destructive" | "warning" | "secondary" | "remote" | "success" {
  switch (status) {
    case "failure":
      return "destructive";
    case "partial_success":
      return "warning";
    case "running":
      return "remote";
    case "success":
      return "success";
    case "never_run":
      return "secondary";
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
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
      <Alert role="status" aria-live="polite" className="mb-6">
        <AlertTitle>Source Status Update Unavailable</AlertTitle>
        <AlertDescription>
          Unable to verify real-time ingestion status. Search results reflect current persisted catalog records.
        </AlertDescription>
      </Alert>
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
    <Alert
      role="status"
      aria-live="polite"
      aria-labelledby="health-notice-heading"
      className="mb-6 border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTitle id="health-notice-heading">
        <h2 className="m-0 text-sm font-bold">Catalog Notice: Partial Source Degraded</h2>
      </AlertTitle>
      <AlertDescription className="text-inherit">
        <p className="m-0 mb-2">
          One or more job sources encountered synchronization issues during their latest ingestion run.
          Persisted records from active sources remain fully searchable, but catalog completeness may be temporarily affected.
        </p>
        <ul className="m-0 mb-2 flex list-none flex-col gap-1 p-0" aria-label="Affected sources">
          {degradedSources.map((s) => (
            <li key={s.source_id} className="flex flex-wrap items-center gap-1">
              <strong>{sourceDisplayName(s.source_id)}</strong>:{" "}
              <Badge variant={statusVariant(s.latest_run_status)}>
                {formatRunStatus(s.latest_run_status)}
              </Badge>
              {s.latest_run_completed_at && (
                <span className="font-mono text-xs opacity-85">
                  {" "}(last run: {formatDate(s.latest_run_completed_at)})
                </span>
              )}
            </li>
          ))}
        </ul>
        {health.catalog_last_seen_at && (
          <p className="m-0 font-mono text-xs opacity-85">
            Latest catalog update: <time dateTime={health.catalog_last_seen_at}>{catalogFreshness}</time>
          </p>
        )}
      </AlertDescription>
    </Alert>
  );
}
