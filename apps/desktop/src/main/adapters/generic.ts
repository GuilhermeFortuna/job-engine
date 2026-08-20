import { fingerprintFromSemanticKey } from "../forms/fingerprint";
import {
  activateResultSchema,
  fillResultSchema,
  observeResultSchema,
  type ActivateResult,
  type FillResult,
  type ObserveResult,
} from "../forms/types";
import type {
  AdapterContext,
  AuthorizedFill,
  FormAdapter,
  PlatformCapability,
  ReceiptCapture,
} from "./contract";

export const GENERIC_ADAPTER_ID = "generic";

/**
 * Browser-neutral adapter for conventional accessible forms.
 *
 * Contains no platform-specific selectors of any kind. It supports visible
 * inputs, textareas, native selects, radio groups, checkboxes, and file inputs
 * that expose a discoverable accessible name; everything else is reported
 * unsupported by the page script rather than guessed at.
 */
export class GenericFormAdapter implements FormAdapter {
  readonly adapterId = GENERIC_ADAPTER_ID;
  readonly capability: PlatformCapability = {
    familyId: "generic_standard_html",
    supportTier: "AUTO_SUPPORTED",
    reasonCode: null,
  };

  /** Any HTTPS page. Platform adapters are consulted first by the registry. */
  matches(url: URL): boolean {
    return url.protocol === "https:";
  }

  async detect(context: AdapterContext): Promise<boolean> {
    const observation = await this.observeStep(context);
    return (
      observation.fields.length > 0 ||
      observation.submitControls.length > 0 ||
      observation.advanceControls.length > 0
    );
  }

  async observeStep(context: AdapterContext): Promise<ObserveResult> {
    const raw = await context.callInIsolatedWorld({ op: "observe" });
    return observeResultSchema.parse(raw);
  }

  async fillStep(
    context: AdapterContext,
    observation: ObserveResult,
    fills: readonly AuthorizedFill[],
  ): Promise<FillResult> {
    const known = new Set(observation.fields.map((f) => f.semanticKey));
    // A fill may only target a field this very observation reported, so a
    // stale decision can never reach a control the runtime has not just seen.
    const targets = fills
      .filter((fill) => known.has(fill.semanticKey))
      .map((fill) => ({
        semanticKey: fill.semanticKey,
        value: fill.value,
        checked: fill.checked,
      }));

    if (targets.length === 0) {
      return { op: "fill", results: [] };
    }

    const raw = await context.callInIsolatedWorld({
      op: "fill",
      expectedPageId: observation.pageId,
      targets,
    });
    return fillResultSchema.parse(raw);
  }

  async advance(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    const control = observation.advanceControls[0];
    if (!control) {
      return { op: "activate", activated: false };
    }
    const raw = await context.callInIsolatedWorld({
      op: "activate",
      kind: "advance",
      controlLabel: control,
    });
    const result = activateResultSchema.parse(raw);
    if (result.activated) {
      await context.waitForStable();
    }
    return result;
  }

  async detectReview(
    _context: AdapterContext,
    observation: ObserveResult,
  ): Promise<boolean> {
    // The final step is the one that offers a submit control and no way
    // onward. A page offering both is still an intermediate step.
    return (
      observation.submitControls.length > 0 &&
      observation.advanceControls.length === 0
    );
  }

  async submitAfterRelease(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    const control = observation.submitControls[0];
    if (!control) {
      return { op: "activate", activated: false };
    }
    const raw = await context.callInIsolatedWorld({
      op: "activate",
      kind: "submit",
      controlLabel: control,
    });
    return activateResultSchema.parse(raw);
  }

  async captureReceipt(context: AdapterContext): Promise<ReceiptCapture | null> {
    await context.waitForStable();
    const observation = await this.observeStep(context);
    const url = context.currentUrl();

    // A confirmation page has no form left to fill and no way to submit again.
    const formCleared =
      observation.fields.length === 0 && observation.submitControls.length === 0;
    if (!formCleared) {
      return null;
    }

    // Prefer the page saying so over the form merely being gone: an error page
    // is also form-free, and an unconfirmed receipt must stay ambiguous.
    return {
      finalUrl: `${url.origin}${url.pathname}`,
      confirmationSignal: observation.confirmationText
        ? "confirmation_text"
        : "form_cleared",
      platformReceiptId: null,
      summaryNotes: null,
    };
  }

  /** Fingerprint a field this adapter observed, for the backend contract. */
  fingerprintFor(semanticKey: string): string {
    return fingerprintFromSemanticKey(this.adapterId, semanticKey);
  }
}
