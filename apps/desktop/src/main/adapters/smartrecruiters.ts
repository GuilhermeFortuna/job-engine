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

export const SMARTRECRUITERS_ADAPTER_ID = "smartrecruiters";

export const APPROVED_SMARTRECRUITERS_HOST = "jobs.smartrecruiters.com";

const SMARTRECRUITERS_PATH_PATTERN =
  /^\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_-]+(?:\/apply)?$/;

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
  return url.hostname.toLowerCase() === APPROVED_SMARTRECRUITERS_HOST;
}

/**
 * SmartRecruiters host/path matcher module.
 *
 * Intentionally **not** registered in `createDefaultAdapterRegistry()` until a
 * production-entrypoint smoke proves AUTO_SUPPORTED. Unregistered hosts fall
 * through to the generic adapter.
 */
export class SmartRecruitersFormAdapter implements FormAdapter {
  readonly adapterId = SMARTRECRUITERS_ADAPTER_ID;
  readonly capability: PlatformCapability = {
    familyId: "smartrecruiters",
    supportTier: "UNSUPPORTED",
    reasonCode: "MISSING_ADAPTER_EVIDENCE",
  };
  private readonly generic = new GenericFormAdapter();

  matches(url: URL): boolean {
    if (!isApprovedOrigin(url)) {
      return false;
    }
    const path = url.pathname.replace(/\/+$/, "");
    return SMARTRECRUITERS_PATH_PATTERN.test(path);
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
