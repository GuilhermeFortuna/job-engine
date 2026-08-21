import type {
  ActivateResult,
  FillResult,
  ObserveResult,
} from "../forms/types";
import type {
  AdapterContext,
  AuthorizedFill,
  FormAdapter,
  PlatformCapability,
  ReceiptCapture,
} from "./contract";
import { GenericFormAdapter } from "./generic";

export const ASHBY_ADAPTER_ID = "ashby";

export const APPROVED_ASHBY_HOST = "jobs.ashbyhq.com";

const ASHBY_PATH_PATTERN =
  /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:\/application)?$/;

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
  return url.hostname.toLowerCase() === APPROVED_ASHBY_HOST;
}

/**
 * Ashby host/path matcher module.
 *
 * Intentionally **not** registered in `createDefaultAdapterRegistry()`. Exact
 * `jobs.ashbyhq.com` pages are hard-classified as UNSUPPORTED /
 * MISSING_ADAPTER_EVIDENCE so they never fall through to generic AUTO_SUPPORTED
 * until production-entrypoint evidence proves the family.
 */
export class AshbyFormAdapter implements FormAdapter {
  readonly adapterId = ASHBY_ADAPTER_ID;
  readonly capability: PlatformCapability = {
    familyId: "ashby",
    supportTier: "UNSUPPORTED",
    reasonCode: "MISSING_ADAPTER_EVIDENCE",
  };
  private readonly generic = new GenericFormAdapter();

  matches(url: URL): boolean {
    if (!isApprovedOrigin(url)) {
      return false;
    }
    const path = url.pathname.replace(/\/+$/, "");
    return ASHBY_PATH_PATTERN.test(path);
  }

  async detect(context: AdapterContext): Promise<boolean> {
    return this.generic.detect(context);
  }

  async observeStep(context: AdapterContext): Promise<ObserveResult> {
    return this.generic.observeStep(context);
  }

  async fillStep(
    context: AdapterContext,
    observation: ObserveResult,
    fills: readonly AuthorizedFill[],
  ): Promise<FillResult> {
    return this.generic.fillStep(context, observation, fills);
  }

  async advance(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    return this.generic.advance(context, observation);
  }

  async detectReview(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<boolean> {
    return this.generic.detectReview(context, observation);
  }

  async submitAfterRelease(
    context: AdapterContext,
    observation: ObserveResult,
  ): Promise<ActivateResult> {
    return this.generic.submitAfterRelease(context, observation);
  }

  async captureReceipt(context: AdapterContext): Promise<ReceiptCapture | null> {
    return this.generic.captureReceipt(context);
  }
}
