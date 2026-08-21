"use client";

import { useSyncExternalStore } from "react";
import { XIcon } from "lucide-react";
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { CatalogHealth, LatestRunStatus, SourceHealth } from "../types";
import { formatDate } from "./JobCard";

const DISMISS_STORAGE_KEY = "catalog-health-notice-dismissed";
const DISMISS_EVENT = "catalog-health-notice-dismissed";
let volatileDismissedFingerprint: string | null = null;

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

function degradedSourcesFrom(health: CatalogHealth): SourceHealth[] {
  return (health.sources || []).filter(
    (s) =>
      s.latest_run_status === "failure" ||
      s.latest_run_status === "partial_success" ||
      s.latest_run_status === "never_run",
  );
}

export function noticeFingerprint(
  health: CatalogHealth | null,
  degradedSources: SourceHealth[],
): string {
  if (health === null) {
    return "unavailable";
  }

  const sourceKey = degradedSources
    .map((s) => `${s.source_id}:${s.latest_run_status}`)
    .sort()
    .join("|");

  return `degraded:${sourceKey}:${health.catalog_last_seen_at ?? ""}`;
}

function readDismissedFingerprint(): string | null {
  if (volatileDismissedFingerprint !== null) {
    return volatileDismissedFingerprint;
  }
  try {
    return sessionStorage.getItem(DISMISS_STORAGE_KEY);
  } catch {
    return volatileDismissedFingerprint;
  }
}

function writeDismissedFingerprint(fingerprint: string): void {
  try {
    sessionStorage.setItem(DISMISS_STORAGE_KEY, fingerprint);
    volatileDismissedFingerprint = null;
  } catch {
    volatileDismissedFingerprint = fingerprint;
  }
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

function subscribeToDismissedFingerprint(onStoreChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onStoreChange);
  window.addEventListener("storage", onStoreChange);
  return () => {
    window.removeEventListener(DISMISS_EVENT, onStoreChange);
    window.removeEventListener("storage", onStoreChange);
  };
}

function DismissButton({ onDismiss }: { onDismiss: () => void }) {
  return (
    <AlertAction>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label="Dismiss catalog notice"
        onClick={onDismiss}
        className="text-current hover:bg-black/5 dark:hover:bg-white/10"
      >
        <XIcon />
      </Button>
    </AlertAction>
  );
}

function useNoticeDismissed(fingerprint: string) {
  const dismissedFingerprint = useSyncExternalStore(
    subscribeToDismissedFingerprint,
    readDismissedFingerprint,
    () => null,
  );

  const dismiss = () => {
    writeDismissedFingerprint(fingerprint);
  };

  return { dismissed: dismissedFingerprint === fingerprint, dismiss };
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
    return <UnavailableNotice />;
  }

  const degradedSources = degradedSourcesFrom(health);
  if (degradedSources.length === 0) {
    return null;
  }

  return (
    <DegradedNotice health={health} degradedSources={degradedSources} />
  );
}

function UnavailableNotice() {
  const fingerprint = noticeFingerprint(null, []);
  const { dismissed, dismiss } = useNoticeDismissed(fingerprint);

  if (dismissed) {
    return null;
  }

  return (
    <Alert role="status" aria-live="polite" className="mb-6">
      <AlertTitle>Source Status Update Unavailable</AlertTitle>
      <AlertDescription>
        Unable to verify real-time ingestion status. Search results reflect current
        persisted catalog records.
      </AlertDescription>
      <DismissButton onDismiss={dismiss} />
    </Alert>
  );
}

function DegradedNotice({
  health,
  degradedSources,
}: {
  health: CatalogHealth;
  degradedSources: SourceHealth[];
}) {
  const fingerprint = noticeFingerprint(health, degradedSources);
  const { dismissed, dismiss } = useNoticeDismissed(fingerprint);

  if (dismissed) {
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
        <h2 className="m-0 text-sm font-bold">
          Catalog Notice: Partial Source Degraded
        </h2>
      </AlertTitle>
      <AlertDescription className="text-inherit">
        <p className="m-0 mb-2">
          One or more job sources encountered synchronization issues during their
          latest ingestion run. Persisted records from active sources remain fully
          searchable, but catalog completeness may be temporarily affected.
        </p>
        <ul
          className="m-0 mb-2 flex list-none flex-col gap-1 p-0"
          aria-label="Affected sources"
        >
          {degradedSources.map((s) => (
            <li key={s.source_id} className="flex flex-wrap items-center gap-1">
              <strong>{sourceDisplayName(s.source_id)}</strong>:{" "}
              <Badge variant={statusVariant(s.latest_run_status)}>
                {formatRunStatus(s.latest_run_status)}
              </Badge>
              {s.latest_run_completed_at && (
                <span className="font-mono text-xs opacity-85">
                  {" "}
                  (last run: {formatDate(s.latest_run_completed_at)})
                </span>
              )}
            </li>
          ))}
        </ul>
        {health.catalog_last_seen_at && (
          <p className="m-0 font-mono text-xs opacity-85">
            Latest catalog update:{" "}
            <time dateTime={health.catalog_last_seen_at}>{catalogFreshness}</time>
          </p>
        )}
      </AlertDescription>
      <DismissButton onDismiss={dismiss} />
    </Alert>
  );
}
