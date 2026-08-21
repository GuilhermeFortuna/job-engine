import type { RuntimeReasonCode } from "../../shared/contracts";

/** Inventory and runtime support tier for an application-platform family. */
export type CoverageSupportTier =
  | "AUTO_SUPPORTED"
  | "ASSISTED_SUPPORTED"
  | "UNSUPPORTED";

/**
 * Explicit coverage reason allowlist. New runtime codes must be opted in here;
 * they do not become coverage reasons by default.
 */
export type PlatformCoverageReasonCode =
  | "AUTH_REQUIRED"
  | "CAPTCHA_REQUIRED"
  | "UNSUPPORTED_CONTROL"
  | "LOOKALIKE_HOST"
  | "AMBIGUOUS_DETECTION"
  | "MISSING_ADAPTER_EVIDENCE"
  | "LEGAL_GATE"
  | "PLATFORM_DRIFT"
  | "FEED_LISTING_UNRESOLVED"
  | "UNAPPROVED_ATS_PATH";

/** Hard vetoes that must never be overridden by canonical URL or loopback adapter id. */
export const HARD_VETO_REASON_CODES: readonly PlatformCoverageReasonCode[] =
  Object.freeze([
    "LOOKALIKE_HOST",
    "AMBIGUOUS_DETECTION",
    "MISSING_ADAPTER_EVIDENCE",
    "LEGAL_GATE",
    "PLATFORM_DRIFT",
    "FEED_LISTING_UNRESOLVED",
  ]);

export interface PlatformCapability {
  readonly familyId: string;
  readonly supportTier: CoverageSupportTier;
  readonly reasonCode: PlatformCoverageReasonCode | null;
}

export function isHardVetoReason(
  reasonCode: PlatformCoverageReasonCode | null,
): boolean {
  return (
    reasonCode !== null &&
    (HARD_VETO_REASON_CODES as readonly string[]).includes(reasonCode)
  );
}

/** Soft inventory reasons that do not block generic fallback. */
export function isSoftCoverageReason(
  reasonCode: PlatformCoverageReasonCode | null,
): boolean {
  return reasonCode === "UNAPPROVED_ATS_PATH";
}

export function coverageReasonToRuntime(
  reasonCode: PlatformCoverageReasonCode,
): RuntimeReasonCode {
  switch (reasonCode) {
    case "AUTH_REQUIRED":
    case "CAPTCHA_REQUIRED":
    case "UNSUPPORTED_CONTROL":
    case "LOOKALIKE_HOST":
    case "AMBIGUOUS_DETECTION":
    case "MISSING_ADAPTER_EVIDENCE":
    case "LEGAL_GATE":
    case "PLATFORM_DRIFT":
    case "FEED_LISTING_UNRESOLVED":
      return reasonCode;
    case "UNAPPROVED_ATS_PATH":
      // Soft path — callers should not pause on this alone.
      return "ADAPTER_UNAVAILABLE";
    default: {
      const _exhaustive: never = reasonCode;
      return _exhaustive;
    }
  }
}

/**
 * Pauses that keep the embedded WebContentsView visible for assisted/manual
 * continuation. Terminal, crash, mismatch, and armed paths still close the view.
 */
export function retainsEmbeddedViewOnPause(
  reasonCode: RuntimeReasonCode,
): boolean {
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
      return exhaustive;
    }
  }
}
