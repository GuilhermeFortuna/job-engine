import type {
  DesktopRuntimeState,
  RuntimePhase,
  RuntimeReasonCode,
} from "./desktop-bridge";
import {
  FULL_AUTO_MODE,
  SEMI_AUTO_MODE,
  isHttpsApplicationUrl,
  type ApplicationRunStatus,
  type ApplicationRunSummary,
  type AutomationMode,
} from "./types";

export type CapabilityState = "AUTO_APPLY" | "ASSISTED" | "UNAVAILABLE";

export type CapabilityReasonCode =
  | "READY"
  | "CAPABILITY_CHECKING"
  | "RUNTIME_UNAVAILABLE"
  | "APPLICATION_URL_MISSING"
  | "APPLICATION_URL_NOT_HTTPS"
  | "PROFILE_REQUIRED"
  | "RESUME_REQUIRED"
  | "PROVIDER_TIER_UNMEASURED";

export interface CapabilityResolution {
  state: CapabilityState;
  reasonCode: CapabilityReasonCode;
  reasonText: string;
}

export interface CapabilityInputs {
  productionRuntimeAvailable: boolean;
  applicationUrl: string | null | undefined;
  profileExists: boolean;
  registeredResumeExists: boolean;
  providerTier: "measured" | "unmeasured";
}

export const CHECKING_CAPABILITY: CapabilityResolution = {
  state: "UNAVAILABLE",
  reasonCode: "CAPABILITY_CHECKING",
  reasonText: "Checking automation availability.",
};

export function resolveApplicationCapability(
  input: CapabilityInputs,
): CapabilityResolution {
  if (!input.productionRuntimeAvailable) {
    return {
      state: "UNAVAILABLE",
      reasonCode: "RUNTIME_UNAVAILABLE",
      reasonText: "The production desktop runtime is unavailable.",
    };
  }
  if (!input.applicationUrl?.trim()) {
    return {
      state: "UNAVAILABLE",
      reasonCode: "APPLICATION_URL_MISSING",
      reasonText: "This job does not have an application URL.",
    };
  }
  if (!isHttpsApplicationUrl(input.applicationUrl)) {
    return {
      state: "UNAVAILABLE",
      reasonCode: "APPLICATION_URL_NOT_HTTPS",
      reasonText: "Automatic application requires a secure HTTPS URL.",
    };
  }
  if (!input.profileExists) {
    return {
      state: "UNAVAILABLE",
      reasonCode: "PROFILE_REQUIRED",
      reasonText: "Complete the applicant profile before launching.",
    };
  }
  if (!input.registeredResumeExists) {
    return {
      state: "UNAVAILABLE",
      reasonCode: "RESUME_REQUIRED",
      reasonText: "Register at least one résumé before launching.",
    };
  }

  switch (input.providerTier) {
    case "measured":
      return {
        state: "AUTO_APPLY",
        reasonCode: "READY",
        reasonText: "Ready for automatic application.",
      };
    case "unmeasured":
      return {
        state: "ASSISTED",
        reasonCode: "PROVIDER_TIER_UNMEASURED",
        reasonText:
          "Provider automation is not yet measured; assisted application remains available.",
      };
    default: {
      const exhaustive: never = input.providerTier;
      throw new Error(`Unhandled provider tier: ${String(exhaustive)}`);
    }
  }
}

export type DurableStatusGroup =
  | "ACTIVE_QUEUED"
  | "NEEDS_ATTENTION"
  | "TERMINAL";

export function groupDurableStatus(
  status: ApplicationRunStatus,
): DurableStatusGroup {
  switch (status) {
    case "queued":
    case "claimed":
    case "running":
      return "ACTIVE_QUEUED";
    case "needs_input":
    case "paused_auth":
    case "failed_retryable":
      return "NEEDS_ATTENTION";
    case "failed_final":
    case "submission_unknown":
    case "submitted":
    case "cancelled":
      return "TERMINAL";
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled application run status: ${String(exhaustive)}`);
    }
  }
}

export interface SafeRunStatusPresentation {
  heading: string;
  guidance: string;
}

export function safeRunStatusPresentation(
  status: ApplicationRunStatus,
): SafeRunStatusPresentation | null {
  switch (status) {
    case "needs_input":
      return {
        heading: "Owner input required",
        guidance:
          "Open the workspace to provide the information required for this run.",
      };
    case "paused_auth":
      return {
        heading: "Authentication required",
        guidance:
          "Authentication or CAPTCHA is blocking automation. Open the workspace to continue safely.",
      };
    case "failed_retryable":
      return {
        heading: "Application attempt failed",
        guidance: "This run can be resumed from its durable checkpoint.",
      };
    case "failed_final":
      return {
        heading: "Application failed",
        guidance:
          "This run cannot be retried. Review the workspace before starting another application.",
      };
    case "submission_unknown":
      return {
        heading: "Submission status unknown",
        guidance:
          "Verify the application with the employer before attempting another submission.",
      };
    case "cancelled":
      return {
        heading: "Application cancelled",
        guidance: "This run was cancelled and will not continue.",
      };
    case "submitted":
      return {
        heading: "Application submitted",
        guidance: "A durable submission receipt is available when captured.",
      };
    case "queued":
    case "claimed":
    case "running":
      return null;
    default: {
      const exhaustive: never = status;
      throw new Error(`Unhandled application run status: ${String(exhaustive)}`);
    }
  }
}

export type DurableRunAction =
  | "REOPEN"
  | "RESOLVE"
  | "RELEASE_SUBMIT"
  | "RESUME"
  | "BLOCKED"
  | null;

export interface DurableRunActionSelection {
  action: DurableRunAction;
  reasonCode: RuntimeReasonCode;
  reasonText: string | null;
}

function isSemiAuto(mode: AutomationMode): boolean {
  switch (mode) {
    case SEMI_AUTO_MODE:
      return true;
    case FULL_AUTO_MODE:
      return false;
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled automation mode: ${String(exhaustive)}`);
    }
  }
}

export function runtimeReasonText(
  reasonCode: RuntimeReasonCode,
): string | null {
  switch (reasonCode) {
    case null:
      return null;
    case "UNAUTHORIZED_FULL_AUTO":
      return "This run is not authorized for automatic submission.";
    case "UNSUPPORTED_AUTOMATION_MODE":
      return "The runtime does not support this automation mode.";
    case "ADAPTER_UNAVAILABLE":
      return "No runtime adapter is available for this application. Resuming may repeat the failure.";
    case "STEP_EXHAUSTED":
      return "The runtime exhausted the allowed attempts for this step. Resuming may repeat the failure.";
    case "STEP_RETRYABLE":
      return "The runtime reported a retryable step failure.";
    case "VIEW_LOCKED_SUBMITTING":
      return "The submitting application view cannot be replaced yet.";
    case "URL_MISMATCH":
      return "The visible application URL did not match the durable run.";
    case "CLAIM_REFUSED":
      return "The runtime could not claim this run.";
    case "LEASE_LOST":
      return "The runtime lost its lease on this run.";
    case "RENDERER_CRASHED":
      return "The embedded application view stopped unexpectedly.";
    case "CAPTCHA_REQUIRED":
      return "A CAPTCHA must be completed before this run can continue.";
    case "AUTH_REQUIRED":
      return "Authentication is required before this run can continue.";
    case "NEEDS_INPUT":
      return "Owner input is required before this run can continue.";
    case "UNSUPPORTED_CONTROL":
      return "The application contains a control that requires owner input.";
    case "SUBMISSION_UNKNOWN":
      return "Submission could not be confirmed; do not retry blindly.";
    case "LOOKALIKE_HOST":
      return "Automation unavailable — the page host looks like a known ATS but is not an approved origin.";
    case "AMBIGUOUS_DETECTION":
      return "Automation unavailable — more than one platform adapter matched this page.";
    case "MISSING_ADAPTER_EVIDENCE":
      return "Automation unavailable — this application platform has no proven adapter evidence yet.";
    case "LEGAL_GATE":
      return "Automation unavailable — this platform is blocked by a legal or policy gate.";
    case "PLATFORM_DRIFT":
      return "Automation unavailable — the visible page no longer matches the expected application platform.";
    case "FEED_LISTING_UNRESOLVED":
      return "Automation unavailable — this URL is a job-feed listing, not a resolved application form.";
    default: {
      const exhaustive: never = reasonCode;
      throw new Error(`Unhandled runtime reason: ${String(exhaustive)}`);
    }
  }
}

export function selectDurableRunAction(
  run: Pick<
    ApplicationRunSummary,
    | "status"
    | "current_checkpoint"
    | "automation_mode"
    | "submit_attempted_at"
  >,
  runtimeReasonCode: RuntimeReasonCode,
): DurableRunActionSelection {
  let action: DurableRunAction;
  if (
    run.submit_attempted_at !== null ||
    run.current_checkpoint === "submitting"
  ) {
    return {
      action: null,
      reasonCode: runtimeReasonCode,
      reasonText: runtimeReasonText(runtimeReasonCode),
    };
  }
  switch (run.status) {
    case "queued":
    case "claimed":
    case "running":
      action = "REOPEN";
      break;
    case "needs_input":
      action =
        run.current_checkpoint === "submit_armed" &&
        isSemiAuto(run.automation_mode)
          ? "RELEASE_SUBMIT"
          : "RESOLVE";
      break;
    case "failed_retryable":
      action = "RESUME";
      break;
    case "paused_auth":
      action = "BLOCKED";
      break;
    case "failed_final":
    case "submission_unknown":
    case "submitted":
    case "cancelled":
      action = null;
      break;
    default: {
      const exhaustive: never = run.status;
      throw new Error(`Unhandled application run status: ${String(exhaustive)}`);
    }
  }
  return {
    action,
    reasonCode: runtimeReasonCode,
    reasonText: runtimeReasonText(runtimeReasonCode),
  };
}

// Mirrors the coordinator view lifecycle. Only coverage/manual pauses retain
// the embedded WebContentsView; crash, mismatch, lease, and terminal pauses
// close it before the paused state is published.
export function inferViewAttached(
  phase: RuntimePhase,
  reasonCode: RuntimeReasonCode = null,
): boolean {
  switch (phase) {
    case "claiming":
    case "filling":
    case "submitting":
      return true;
    case "paused":
      switch (reasonCode) {
        case "LOOKALIKE_HOST":
        case "AMBIGUOUS_DETECTION":
        case "MISSING_ADAPTER_EVIDENCE":
        case "LEGAL_GATE":
        case "PLATFORM_DRIFT":
        case "FEED_LISTING_UNRESOLVED":
        case "AUTH_REQUIRED":
        case "CAPTCHA_REQUIRED":
        case "UNSUPPORTED_CONTROL":
        case "ADAPTER_UNAVAILABLE":
        case "NEEDS_INPUT":
        case "STEP_RETRYABLE":
        case "STEP_EXHAUSTED":
          return true;
        case "UNAUTHORIZED_FULL_AUTO":
        case "UNSUPPORTED_AUTOMATION_MODE":
        case "VIEW_LOCKED_SUBMITTING":
        case "URL_MISMATCH":
        case "CLAIM_REFUSED":
        case "LEASE_LOST":
        case "RENDERER_CRASHED":
        case "SUBMISSION_UNKNOWN":
        case null:
          return false;
        default: {
          const exhaustive: never = reasonCode;
          throw new Error(
            `Unhandled paused runtime reason: ${String(exhaustive)}`,
          );
        }
      }
    case "idle":
    case "armed":
    case "queued":
    case "terminal":
      return false;
    default: {
      const exhaustive: never = phase;
      throw new Error(`Unhandled runtime phase: ${String(exhaustive)}`);
    }
  }
}

export interface AppliedRuntimeState {
  runtimeState: DesktopRuntimeState | null;
  viewAttached: boolean;
}

export function applyRuntimeState(
  run: Pick<ApplicationRunSummary, "id">,
  runtimeState: DesktopRuntimeState,
): AppliedRuntimeState {
  if (runtimeState.runId !== run.id) {
    return {
      runtimeState: null,
      viewAttached: false,
    };
  }
  return {
    runtimeState,
    viewAttached: inferViewAttached(
      runtimeState.phase,
      runtimeState.reasonCode,
    ),
  };
}
