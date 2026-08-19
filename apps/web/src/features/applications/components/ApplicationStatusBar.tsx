import {
  canReleaseSubmit,
  countFieldReports,
  collectFieldReports,
  type ApplicationRunStatus,
  type SafeException,
} from "../types";

export interface ApplicationStatusBarProps {
  status: ApplicationRunStatus | string;
  checkpoint: string | null;
  exceptions: SafeException[];
  openRunId: string | null;
  routeRunId: string;
  submitting: boolean;
  disconnected: boolean;
  onSubmit: () => void;
  onCancel: () => void;
}

export function ApplicationStatusBar({
  status,
  checkpoint,
  exceptions,
  openRunId,
  routeRunId,
  submitting,
  disconnected,
  onSubmit,
  onCancel,
}: ApplicationStatusBarProps) {
  const counts = countFieldReports(collectFieldReports(exceptions));
  const canSubmit = canReleaseSubmit({
    status: status as ApplicationRunStatus,
    checkpoint,
    exceptions,
    openRunId,
    routeRunId,
  });

  return (
    <div className="application-status-bar">
      <p>
        Status: {status.replaceAll("_", " ")}
        {checkpoint ? ` · Checkpoint: ${checkpoint.replaceAll("_", " ")}` : ""}
        {` · Filled ${counts.filled}, review ${counts.review}, unresolved ${counts.unresolved}`}
      </p>
      {disconnected ? (
        <p role="status">Disconnected from live updates. Reconnecting…</p>
      ) : null}
      <div className="application-status-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={
            submitting ||
            status === "submitted" ||
            status === "cancelled" ||
            status === "failed_final"
          }
        >
          Cancel run
        </button>
        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmit}
          disabled={!canSubmit || submitting}
        >
          Submit application
        </button>
      </div>
    </div>
  );
}
