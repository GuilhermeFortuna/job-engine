import {
  FULL_AUTO_MODE,
  SEMI_AUTO_MODE,
  countFieldReports,
  collectFieldReports,
  type ApplicationRunStatus,
  type AutomationMode,
  type SafeException,
} from "../types";
import type { RuntimePhase } from "../desktop-bridge";
import type { DurableRunAction } from "../projections";

export interface ApplicationStatusBarProps {
  status: ApplicationRunStatus;
  checkpoint: string | null;
  exceptions: SafeException[];
  mode: AutomationMode;
  automaticSubmissionAuthorized: boolean;
  automaticSubmissionAuthorizedAt: string | null;
  submitAttemptedAt: string | null;
  runtimePhase: RuntimePhase | null;
  runtimeReasonText: string | null;
  action: DurableRunAction;
  submitting: boolean;
  disconnected: boolean;
  onPrimaryAction: () => void;
  onCancel: () => void;
}

function primaryActionLabel(action: DurableRunAction): string | null {
  switch (action) {
    case "REOPEN":
      return "Reopen desktop view";
    case "RELEASE_SUBMIT":
      return "Submit application";
    case "RESUME":
      return "Resume application";
    case "RESOLVE":
    case "BLOCKED":
    case null:
      return null;
    default: {
      const exhaustive: never = action;
      throw new Error(`Unhandled durable action: ${String(exhaustive)}`);
    }
  }
}

function automationModeLabel(mode: AutomationMode): string {
  switch (mode) {
    case FULL_AUTO_MODE:
      return "full auto";
    case SEMI_AUTO_MODE:
      return "assisted";
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled automation mode: ${String(exhaustive)}`);
    }
  }
}

export function ApplicationStatusBar({
  status,
  checkpoint,
  exceptions,
  mode,
  automaticSubmissionAuthorized,
  automaticSubmissionAuthorizedAt,
  submitAttemptedAt,
  runtimePhase,
  runtimeReasonText,
  action,
  submitting,
  disconnected,
  onPrimaryAction,
  onCancel,
}: ApplicationStatusBarProps) {
  const counts = countFieldReports(collectFieldReports(exceptions));
  const primaryLabel = primaryActionLabel(action);
  const terminal =
    status === "submitted" ||
    status === "submission_unknown" ||
    status === "failed_final" ||
    status === "cancelled";
  const modeLabel = automationModeLabel(mode);

  return (
    <div className="application-status-bar">
      <div>
        <p>
          Status: {status.replaceAll("_", " ")}
          {checkpoint ? ` · Checkpoint: ${checkpoint.replaceAll("_", " ")}` : ""}
          {` · Filled ${counts.filled}, review ${counts.review}, unresolved ${counts.unresolved}`}
        </p>
        <p>Mode: {modeLabel}</p>
        {mode === FULL_AUTO_MODE ? (
          <p>
            Automatic submission authorized:{" "}
            {automaticSubmissionAuthorized
              ? (automaticSubmissionAuthorizedAt ?? "timestamp unavailable")
              : "No"}
          </p>
        ) : null}
        {runtimePhase ? <p>Runtime phase: {runtimePhase}</p> : null}
        {runtimeReasonText ? <p>{runtimeReasonText}</p> : null}
        {submitAttemptedAt !== null || checkpoint === "submitting" ? (
          <p>Submission already started. Activating actions are unavailable.</p>
        ) : null}
      </div>
      {disconnected ? (
        <p role="status">
          Live updates disconnected. Displayed progress may be stale;
          reconnecting.
        </p>
      ) : null}
      <div className="application-status-actions">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onCancel}
          disabled={submitting || terminal}
        >
          Cancel run
        </button>
        {primaryLabel ? (
          <button
            type="button"
            className="btn btn-primary"
            onClick={onPrimaryAction}
            disabled={submitting}
          >
            {primaryLabel}
          </button>
        ) : null}
      </div>
    </div>
  );
}
