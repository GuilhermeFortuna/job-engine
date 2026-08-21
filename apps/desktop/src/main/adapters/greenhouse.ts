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

export const GREENHOUSE_ADAPTER_ID = "greenhouse";

/**
 * Approved first-party Greenhouse job-board HTTPS hostnames.
 *
 * Matching is strict hostname equality. Subdomains (e.g. evil.boards.greenhouse.io)
 * and substring lookalikes are rejected.
 */
export const APPROVED_GREENHOUSE_HOSTS: readonly string[] = Object.freeze([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
]);

/**
 * Anchored path pattern for job application forms:
 * `/{company}/jobs/{job_id}` where company is an alphanumeric identifier and job_id is digits.
 */
const GREENHOUSE_JOB_PATH_PATTERN = /^\/[a-zA-Z0-9_-]+\/jobs\/\d+$/;

/**
 * Normalized token helper for field identity and attestation detection.
 */
function norm(text: string): string {
  return text
    .replace(/[\s\u00A0]+/g, " ")
    .replace(/[\s\u00A0*\u2217]+$/g, "")
    .trim()
    .toLowerCase();
}

/**
 * Keywords indicating legal consent, attestation, certification, or signature semantics.
 * Fields matching these terms must NEVER be auto-filled and must pause for manual owner review.
 */
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

/**
 * Greenhouse platform adapter for the visible embedded Electron workspace.
 *
 * Reuses normalized observation, isolated-world scripts, upload mechanics, and
 * verification from CROSS-010 while enforcing strict platform matching, dual-signal
 * detection, and Greenhouse-specific confirmation rules.
 */
export class GreenhouseFormAdapter implements FormAdapter {
  readonly adapterId = GREENHOUSE_ADAPTER_ID;
  readonly capability: PlatformCapability = {
    familyId: "greenhouse",
    supportTier: "AUTO_SUPPORTED",
    reasonCode: null,
  };
  private readonly generic = new GenericFormAdapter();

  /**
   * Exact host and path matching for approved Greenhouse job boards.
   *
   * Rejects HTTP, URL credentials, unapproved ports, subdomains, lookalikes,
   * empty segments, and unrelated paths.
   */
  matches(url: URL): boolean {
    if (url.protocol !== "https:") {
      return false;
    }
    if (url.username !== "" || url.password !== "") {
      return false;
    }
    if (url.port !== "" && url.port !== "443") {
      return false;
    }

    const host = url.hostname.toLowerCase();
    const isApprovedHost = APPROVED_GREENHOUSE_HOSTS.includes(host);
    if (!isApprovedHost) {
      return false;
    }

    const path = url.pathname.replace(/\/+$/, "");
    return GREENHOUSE_JOB_PATH_PATTERN.test(path);
  }

  /**
   * Requires two independent detection signals:
   * 1. URL matches approved Greenhouse host and job path pattern.
   * 2. Normalized observation contains submit control and standard required
   *    identity fields (First Name, Last Name, and Email).
   */
  async detect(context: AdapterContext): Promise<boolean> {
    const url = context.currentUrl();
    if (!this.matches(url)) {
      return false;
    }

    const observation = await this.observeStep(context);
    if (observation.submitControls.length === 0) {
      return false;
    }

    const hasRequiredFirstName = observation.fields.some(
      (f) =>
        f.required &&
        (norm(f.label).includes("first name") ||
          norm(f.accessibleName ?? "").includes("first name")),
    );
    const hasRequiredLastName = observation.fields.some(
      (f) =>
        f.required &&
        (norm(f.label).includes("last name") ||
          norm(f.accessibleName ?? "").includes("last name")),
    );
    const hasRequiredEmail = observation.fields.some(
      (f) =>
        f.required &&
        (norm(f.label).includes("email") ||
          norm(f.accessibleName ?? "").includes("email")),
    );

    return hasRequiredFirstName && hasRequiredLastName && hasRequiredEmail;
  }

  async observeStep(context: AdapterContext): Promise<ObserveResult> {
    return this.generic.observeStep(context);
  }

  /**
   * Fills verified decisions, filtering out any legal attestation or signature fields
   * so they remain unresolved for explicit owner action.
   */
  async fillStep(
    context: AdapterContext,
    observation: ObserveResult,
    fills: readonly AuthorizedFill[],
  ): Promise<FillResult> {
    const fieldsByKey = new Map(observation.fields.map((f) => [f.semanticKey, f]));

    const allowedFills = fills.filter((fill) => {
      const field = fieldsByKey.get(fill.semanticKey);
      if (!field) {
        return false;
      }
      // Never auto-fill legal consent, certification, attestation, or signature controls
      if (isLegalOrAttestationField(field)) {
        return false;
      }
      return true;
    });

    return this.generic.fillStep(context, observation, allowedFills);
  }

  /**
   * Intermediate navigation advance. Greenhouse forms are baseline single-page;
   * delegates if an advance control is present, otherwise returns activated: false.
   */
  async advance(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    return this.generic.advance(context, observation);
  }

  /**
   * Detects review stage: URL matches Greenhouse, submit control is available,
   * and no advance control exists.
   */
  async detectReview(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<boolean> {
    return (
      this.matches(context.currentUrl()) &&
      observation.submitControls.length > 0 &&
      observation.advanceControls.length === 0
    );
  }

  /**
   * Activates the final Greenhouse submit control once after owner release.
   */
  async submitAfterRelease(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    return this.generic.submitAfterRelease(context, observation);
  }

  /**
   * Captures receipt on confirmed submission.
   *
   * Requires an approved Greenhouse origin and positive confirmation signal
   * (`confirmationText === true` with cleared submit form). Ambiguous or error
   * states return null so the runtime classifies them as `SUBMISSION_UNKNOWN`.
   */
  async captureReceipt(context: AdapterContext): Promise<ReceiptCapture | null> {
    await context.waitForStable();
    const observation = await this.observeStep(context);
    const url = context.currentUrl();

    if (url.protocol !== "https:") {
      return null;
    }
    const host = url.hostname.toLowerCase();
    if (!APPROVED_GREENHOUSE_HOSTS.includes(host)) {
      return null;
    }

    const formCleared =
      observation.fields.length === 0 && observation.submitControls.length === 0;
    if (!formCleared) {
      return null;
    }

    // Require positive confirmation signal. Generic form_cleared alone is not proof.
    if (!observation.confirmationText) {
      return null;
    }

    return {
      finalUrl: `${url.origin}${url.pathname}`,
      confirmationSignal: "confirmation_text",
      platformReceiptId: null,
      summaryNotes: null,
    };
  }
}
