"use client";

import Link from "next/link";
import { useState } from "react";
import {
  applyRuntimeState,
  groupDurableStatus,
  runtimeReasonText,
  safeRunStatusPresentation,
  type DurableStatusGroup,
} from "../projections";
import { useApplicationRuns } from "../hooks/useApplicationRuns";
import type { RunEventsConnectionState } from "../hooks/useApplicationRuns";
import { useApplicationRuntimeSnapshot } from "../hooks/useApplicationRuntime";
import type { DesktopRuntimeState } from "../desktop-bridge";
import {
  isHttpsApplicationUrl,
  summarizeChecksum,
  workspacePath,
  type ApplicationRunSummary,
} from "../types";

const RUN_GROUPS: ReadonlyArray<{
  id: DurableStatusGroup;
  heading: string;
}> = [
  { id: "ACTIVE_QUEUED", heading: "Active and queued" },
  { id: "NEEDS_ATTENTION", heading: "Needs attention" },
  { id: "TERMINAL", heading: "Terminal" },
];

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.valueOf())) {
    return "Unknown";
  }
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function RunRow({
  run,
  runtimeState,
}: {
  run: ApplicationRunSummary;
  runtimeState: DesktopRuntimeState | null;
}) {
  const runtime =
    runtimeState === null
      ? { runtimeState: null, viewAttached: false }
      : applyRuntimeState(run, runtimeState);
  const runtimeReason = runtime.runtimeState
    ? runtimeReasonText(runtime.runtimeState.reasonCode)
    : null;
  const statusPresentation = safeRunStatusPresentation(run.status);

  return (
    <article
      aria-label={`Application run ${run.id}`}
      className="application-run-card"
      data-status={run.status}
    >
      <div className="application-run-card-header">
        <div>
          <h4 className="application-run-job">Job {run.job_group_id}</h4>
          <p className="application-run-id">Run {run.id}</p>
          <p className="application-run-status">{run.status}</p>
        </div>
        <div className="application-run-links">
          <Link className="btn btn-primary" href={workspacePath(run.id)}>
            Open application workspace
          </Link>
          {isHttpsApplicationUrl(run.application_url) ? (
            <a
              className="btn btn-secondary"
              href={run.application_url}
              rel="noopener noreferrer"
              target="_blank"
            >
              Open external application
            </a>
          ) : null}
        </div>
      </div>

      <dl className="application-run-details">
        <div>
          <dt>Checkpoint</dt>
          <dd>{run.current_checkpoint ?? "Not reached"}</dd>
        </div>
        <div>
          <dt>Mode</dt>
          <dd>{run.automation_mode}</dd>
        </div>
        <div>
          <dt>Résumé checksum</dt>
          <dd>{summarizeChecksum(run.resume_sha256)}</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>
            <time dateTime={run.created_at}>{formatTimestamp(run.created_at)}</time>
          </dd>
        </div>
        <div>
          <dt>Updated</dt>
          <dd>
            <time dateTime={run.updated_at}>{formatTimestamp(run.updated_at)}</time>
          </dd>
        </div>
      </dl>

      {statusPresentation ? (
        <section
          aria-label="Run outcome guidance"
          className="application-run-guidance"
        >
          <h5>{statusPresentation.heading}</h5>
          <p>{statusPresentation.guidance}</p>
        </section>
      ) : null}

      {runtime.runtimeState ? (
        <div className="application-runtime-progress" role="status">
          <p>Runtime progress: {runtime.runtimeState.phase}</p>
          <p>
            Runtime checkpoint:{" "}
            {runtime.runtimeState.checkpoint ?? "Not reached"}
          </p>
          {runtime.viewAttached ? <p>Embedded view attached</p> : null}
          {runtimeReason ? <p>{runtimeReason}</p> : null}
        </div>
      ) : null}

      {run.receipt_summary ? (
        <section
          aria-label="Submission receipt"
          className="application-run-receipt"
        >
          <h4>Submission receipt</h4>
          <p>
            Receipt ID:{" "}
            {run.receipt_summary.platform_receipt_id ?? "Not provided"}
          </p>
          <p>{run.receipt_summary.confirmation_signal}</p>
          <time dateTime={run.receipt_summary.capture_timestamp}>
            {formatTimestamp(run.receipt_summary.capture_timestamp)}
          </time>
        </section>
      ) : null}
    </article>
  );
}

function RunGroup({
  group,
  heading,
  runs,
  runtimeState,
}: {
  group: DurableStatusGroup;
  heading: string;
  runs: ApplicationRunSummary[];
  runtimeState: DesktopRuntimeState | null;
}) {
  const groupedRuns = runs.filter(
    (run) => groupDurableStatus(run.status) === group,
  );
  return (
    <section
      aria-labelledby={`application-run-group-${group}`}
      className="application-run-group"
    >
      <h3 id={`application-run-group-${group}`}>{heading}</h3>
      {groupedRuns.length === 0 ? (
        <p className="application-run-group-empty">No runs in this group.</p>
      ) : (
        <div className="application-run-list">
          {groupedRuns.map((run) => (
            <RunRow key={run.id} run={run} runtimeState={runtimeState} />
          ))}
        </div>
      )}
    </section>
  );
}

export function ApplicationsControlCenter() {
  const state = useApplicationRuns();
  const runtime = useApplicationRuntimeSnapshot();
  const runs = state.runs?.items ?? [];
  const [connectionHistory, setConnectionHistory] = useState<{
    current: RunEventsConnectionState;
    previous: RunEventsConnectionState | null;
  }>({
    current: state.connectionState,
    previous: null,
  });
  if (connectionHistory.current !== state.connectionState) {
    setConnectionHistory({
      current: state.connectionState,
      previous: connectionHistory.current,
    });
  }
  const previousConnectionState =
    connectionHistory.current === state.connectionState
      ? connectionHistory.previous
      : connectionHistory.current;
  let connectionMessage: string;

  switch (state.connectionState) {
    case "connecting":
      connectionMessage = "Connecting to live application updates";
      break;
    case "connected":
      connectionMessage =
        previousConnectionState === "degraded"
          ? "Live application updates recovered"
          : "Live application updates connected";
      break;
    case "degraded":
      connectionMessage = "Live updates degraded; displayed runs may be stale";
      break;
    default: {
      const exhaustive: never = state.connectionState;
      throw new Error(`Unhandled connection state: ${String(exhaustive)}`);
    }
  }

  return (
    <section
      aria-labelledby="applications-control-center-heading"
      className="applications-control-center"
    >
      <div className="applications-section-heading">
        <div>
          <h2 id="applications-control-center-heading">Application runs</h2>
          <p>Durable backend state remains authoritative for every run.</p>
        </div>
        <button
          className="btn btn-secondary"
          onClick={() => void state.refresh()}
          type="button"
        >
          Refresh applications
        </button>
      </div>

      <p
        aria-live="polite"
        className={`applications-stream-state applications-stream-state-${state.connectionState}`}
        role="status"
      >
        {connectionMessage}
      </p>
      {state.isLoading ? (
        <p aria-busy="true" aria-live="polite" role="status">
          Loading application runs
        </p>
      ) : null}
      {state.error ? (
        <p role="alert">Unable to load application runs.</p>
      ) : null}

      {!state.isLoading && !state.error && runs.length === 0 ? (
        <div className="applications-empty">
          <h3>No application runs yet</h3>
          <p>Choose a supported job to start an application.</p>
          <Link className="btn btn-primary" href="/jobs">
            Browse jobs
          </Link>
        </div>
      ) : null}

      {runs.length > 0 ? (
        <>
          <p className="applications-run-count">
            Showing {runs.length} of {state.runs?.total ?? runs.length} application
            runs
          </p>
          <div className="application-run-groups">
            {RUN_GROUPS.map(({ id, heading }) => (
              <RunGroup
                group={id}
                heading={heading}
                key={id}
                runs={runs}
                runtimeState={runtime.runtimeState}
              />
            ))}
          </div>
          {state.loadMoreError ? (
            <p role="alert">Unable to load more application runs.</p>
          ) : null}
          {state.hasMore ? (
            <button
              className="btn btn-secondary applications-load-more"
              disabled={state.isLoading || state.isLoadingMore}
              onClick={() => void state.loadMore()}
              type="button"
            >
              {state.isLoadingMore
                ? "Loading more applications"
                : "Load more applications"}
            </button>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
