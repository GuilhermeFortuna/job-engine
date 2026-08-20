import {
  type ActivateResult,
  type FillResult,
  type ObserveResult,
  type RawField,
} from "../forms/types";
import {
  type AdapterContext,
  type AuthorizedFill,
  type FormAdapter,
  type PlatformCapability,
  type ReceiptCapture,
} from "./contract";
import { GenericFormAdapter } from "./generic";

export const LEVER_ADAPTER_ID = "lever";

/** Exact hostname bound in the platform register. Never a parent-domain match. */
export const APPROVED_LEVER_HOST = "jobs.lever.co";

const SEGMENT = /^[A-Za-z0-9._-]+$/;

export type LeverPathKind = "posting" | "apply" | "thanks";

function norm(text: string): string {
  return text
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[\s\u00A0*\u2217]+$/g, "")
    .trim()
    .toLowerCase();
}

function isApprovedOrigin(url: URL): boolean {
  if (url.protocol !== "https:") {
    return false;
  }
  if (url.username !== "" || url.password !== "") {
    return false;
  }
  if (url.port !== "" && url.port !== "443") {
    return false;
  }
  return url.hostname.toLowerCase() === APPROVED_LEVER_HOST;
}

function isSegment(value: string): boolean {
  return SEGMENT.test(value);
}

/**
 * Classifies a bound Lever path family.
 *
 * Posting pages are matched so generic never owns them; they are not a
 * supported assisted-apply surface.
 */
export function leverPathKind(url: URL): LeverPathKind | null {
  if (!isApprovedOrigin(url)) {
    return null;
  }
  const path = url.pathname.replace(/\/+$/, "");
  const split = path.split("/");
  if (split[0] !== "") {
    return null;
  }
  const parts = split.slice(1);
  if (parts.some((part) => part === "")) {
    return null;
  }
  if (parts.length === 2 && isSegment(parts[0]) && isSegment(parts[1])) {
    return "posting";
  }
  if (
    parts.length === 3 &&
    isSegment(parts[0]) &&
    isSegment(parts[1]) &&
    parts[2] === "apply"
  ) {
    return "apply";
  }
  if (
    parts.length === 3 &&
    isSegment(parts[0]) &&
    isSegment(parts[1]) &&
    parts[2] === "thanks"
  ) {
    return "thanks";
  }
  return null;
}

const LEGAL_TERMS = [
  "attest",
  "certif",
  "consent",
  "signature",
  "sign here",
  "i declare",
  "background check",
  "terms and conditions",
  "acknowledgement",
  "acknowledgment",
  "agreement",
];

function isLegalOrAttestationField(field: RawField): boolean {
  const text = `${norm(field.label)} ${norm(field.accessibleName ?? "")}`;
  return LEGAL_TERMS.some((term) => text.includes(term));
}

function hasFullNameField(observation: ObserveResult): boolean {
  return observation.fields.some(
    (field) =>
      field.controlType === "text" &&
      (norm(field.label).includes("full name") ||
        norm(field.accessibleName ?? "").includes("full name")),
  );
}

function hasResumeField(observation: ObserveResult): boolean {
  return observation.fields.some(
    (field) =>
      field.controlType === "file" &&
      (norm(field.label).includes("resume") ||
        norm(field.accessibleName ?? "").includes("resume")),
  );
}

function formCleared(observation: ObserveResult): boolean {
  return observation.fields.length === 0 && observation.submitControls.length === 0;
}

/**
 * Independent Lever adapter for the visible embedded workspace.
 *
 * Reuses CROSS-010 observation, fill, upload, and activate. Detection is
 * `/apply`-only. Posting-page anchors are never activated.
 */
export class LeverFormAdapter implements FormAdapter {
  readonly adapterId = LEVER_ADAPTER_ID;
  readonly capability: PlatformCapability = {
    familyId: "lever",
    supportTier: "AUTO_SUPPORTED",
    reasonCode: null,
  };
  private readonly generic = new GenericFormAdapter();

  matches(url: URL): boolean {
    return leverPathKind(url) !== null;
  }

  /**
   * Two signals: approved `/apply` URL, and observe reports both a Full name
   * text field and a Resume/CV file field.
   */
  async detect(context: AdapterContext): Promise<boolean> {
    if (leverPathKind(context.currentUrl()) !== "apply") {
      return false;
    }
    const observation = await this.observeStep(context);
    return hasFullNameField(observation) && hasResumeField(observation);
  }

  async observeStep(context: AdapterContext): Promise<ObserveResult> {
    return this.generic.observeStep(context);
  }

  async fillStep(
    context: AdapterContext,
    observation: ObserveResult,
    fills: readonly AuthorizedFill[],
  ): Promise<FillResult> {
    const fieldsByKey = new Map(
      observation.fields.map((field) => [field.semanticKey, field]),
    );
    const allowed = fills.filter((fill) => {
      const field = fieldsByKey.get(fill.semanticKey);
      if (!field) {
        return false;
      }
      return !isLegalOrAttestationField(field);
    });
    return this.generic.fillStep(context, observation, allowed);
  }

  /**
   * Lever assisted execution is single-page `/apply`. Posting CTAs are plain
   * anchors and must not be treated as advance controls.
   */
  async advance(
    _context: AdapterContext,
    _observation: ObserveResult,
  ): Promise<ActivateResult> {
    return { op: "activate", activated: false };
  }

  async detectReview(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<boolean> {
    return (
      leverPathKind(context.currentUrl()) === "apply" &&
      observation.submitControls.length > 0 &&
      observation.advanceControls.length === 0
    );
  }

  async submitAfterRelease(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    return this.generic.submitAfterRelease(context, observation);
  }

  /**
   * Success is either approved `/thanks` plus a cleared form, or a cleared
   * form plus the generic confirmation boolean. A remaining form is ambiguous.
   */
  async captureReceipt(context: AdapterContext): Promise<ReceiptCapture | null> {
    await context.waitForStable();
    const url = context.currentUrl();
    const kind = leverPathKind(url);
    if (kind === null) {
      return null;
    }

    const observation = await this.observeStep(context);
    if (!formCleared(observation)) {
      return null;
    }

    const thanks = kind === "thanks";
    if (!thanks && !observation.confirmationText) {
      return null;
    }

    return {
      finalUrl: `${url.origin}${url.pathname}`,
      confirmationSignal: observation.confirmationText
        ? "confirmation_text"
        : "thanks_path",
      platformReceiptId: null,
      summaryNotes: null,
    };
  }
}
