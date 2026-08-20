import type {
  ActivateResult,
  AnswerDecision,
  FillResult,
  ObserveResult,
  StepOutcome,
} from "../forms/types";
import type { PageScriptArgs } from "../forms/page-script";
import type { RuntimeReasonCode } from "../../shared/contracts";

/** Inventory and runtime support tier for an application-platform family. */
export type CoverageSupportTier =
  | "AUTO_SUPPORTED"
  | "ASSISTED_SUPPORTED"
  | "UNSUPPORTED";

/**
 * Stable coverage reason codes for inventory rows and hard automation vetoes.
 * Runtime pause codes reuse {@link RuntimeReasonCode}; inaccessible controls map
 * to existing `UNSUPPORTED_CONTROL`.
 */
export type PlatformCoverageReasonCode = Exclude<
  RuntimeReasonCode,
  | "UNAUTHORIZED_FULL_AUTO"
  | "UNSUPPORTED_AUTOMATION_MODE"
  | "ADAPTER_UNAVAILABLE"
  | "STEP_EXHAUSTED"
  | "STEP_RETRYABLE"
  | "VIEW_LOCKED_SUBMITTING"
  | "URL_MISMATCH"
  | "CLAIM_REFUSED"
  | "LEASE_LOST"
  | "RENDERER_CRASHED"
  | "NEEDS_INPUT"
  | "SUBMISSION_UNKNOWN"
  | null
>;

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

export interface PlatformClassification extends PlatformCapability {
  readonly adapter: FormAdapter | null;
}

export function isHardVetoReason(
  reasonCode: PlatformCoverageReasonCode | null,
): reasonCode is PlatformCoverageReasonCode {
  return (
    reasonCode !== null &&
    (HARD_VETO_REASON_CODES as readonly string[]).includes(reasonCode)
  );
}

/**
 * Everything an adapter is allowed to do to a page.
 *
 * Adapters receive this port rather than a `webContents`, so adapter code never
 * imports Electron, never sees a session, cookie, token, or filesystem path,
 * and can be exercised entirely in a DOM test. It is also the seam the
 * platform-specific adapters build on.
 */
export interface AdapterContext {
  /** Run the one bundled page script with a structured, by-value argument. */
  callInIsolatedWorld(args: PageScriptArgs): Promise<unknown>;
  /** Current page URL, already validated by the navigation policy. */
  currentUrl(): URL;
  /** Resolve once the page has settled after a mutation or navigation. */
  waitForStable(): Promise<void>;
  /**
   * Attach the granted resume to a file control.
   *
   * Implemented outside the page: the page script can never be handed a
   * filesystem path.
   */
  attachResume(semanticKey: string): Promise<{ attached: boolean }>;
}

/** A decision paired with the field it applies to, ready to write. */
export interface AuthorizedFill {
  semanticKey: string;
  fieldFingerprint: string;
  value: string | null;
  checked: boolean | null;
  decision: AnswerDecision;
}

export interface StepReport {
  outcome: StepOutcome;
  observation: ObserveResult | null;
  /** Fingerprints the owner must resolve before the step can advance. */
  blockingFingerprints: string[];
  /** Non-sensitive detail for the trusted UI and exception context. */
  detail: string;
}

export interface ReceiptCapture {
  finalUrl: string;
  confirmationSignal: string;
  platformReceiptId: string | null;
  summaryNotes: string | null;
}

/**
 * A site adapter. The generic adapter implements this against conventional
 * accessible markup; platform adapters (CROSS-007, CROSS-008) implement the
 * same surface without changing the runtime.
 */
export interface FormAdapter {
  readonly adapterId: string;
  /** Coverage metadata published in the platform inventory and registry. */
  readonly capability: PlatformCapability;

  /**
   * Exact host/path matching. Implementations parse with `URL` and compare
   * host equality, never string prefixes, so a hostile host that merely
   * contains a supported name cannot masquerade as it.
   */
  matches(url: URL): boolean;

  /** Whether this page is an application form this adapter can drive. */
  detect(context: AdapterContext): Promise<boolean>;

  observeStep(context: AdapterContext): Promise<ObserveResult>;

  fillStep(
    context: AdapterContext,
    observation: ObserveResult,
    fills: readonly AuthorizedFill[],
  ): Promise<FillResult>;

  /** Move to the next step. Never used to submit. */
  advance(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult>;

  /** Whether the page is the final review/submit step. */
  detectReview(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<boolean>;

  /**
   * Activate the final submit control exactly once.
   *
   * Only ever called after the backend run has been released and re-claimed at
   * `submit_armed`.
   */
  submitAfterRelease(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult>;

  captureReceipt(context: AdapterContext): Promise<ReceiptCapture | null>;
}
