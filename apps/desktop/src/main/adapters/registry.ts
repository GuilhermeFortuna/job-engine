import type { RuntimeReasonCode } from "../../shared/contracts";
import { AshbyFormAdapter } from "./ashby";
import type {
  FormAdapter,
  PlatformClassification,
  PlatformCoverageReasonCode,
} from "./contract";
import { isHardVetoReason } from "./contract";
import { GenericFormAdapter } from "./generic";
import { GreenhouseFormAdapter } from "./greenhouse";
import { LeverFormAdapter } from "./lever";
import { SmartRecruitersFormAdapter } from "./smartrecruiters";
import { isWorkdayHost } from "./workday";

/** Feed listing hosts stored by approved job sources — not downstream ATS apply URLs. */
export const FEED_LISTING_HOSTS: readonly string[] = Object.freeze([
  "himalayas.app",
  "jobicy.com",
  "remoteok.com",
]);

/**
 * Approved ATS apex domains used for lookalike detection via {@link hostMatches}.
 * A suffix match without an exact approved adapter match is a lookalike.
 */
export const ATS_APEX_DOMAINS: readonly string[] = Object.freeze([
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "myworkdayjobs.com",
]);

/** Strip query and fragment before host/path classification. */
export function normalizeClassificationUrl(rawUrl: string): URL | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") {
    return null;
  }
  url.hash = "";
  url.search = "";
  return url;
}

function isFeedListingHost(url: URL): boolean {
  const host = url.hostname.toLowerCase();
  return FEED_LISTING_HOSTS.some(
    (listingHost) => host === listingHost || host.endsWith(`.${listingHost}`),
  );
}

function matchingPlatformAdapters(
  url: URL,
  adapters: readonly FormAdapter[],
): FormAdapter[] {
  return adapters.filter((adapter) => adapter.matches(url));
}

function lookalikeReason(url: URL, adapters: readonly FormAdapter[]): PlatformCoverageReasonCode | null {
  for (const apex of ATS_APEX_DOMAINS) {
    if (!hostMatches(url, apex)) {
      continue;
    }
    if (matchingPlatformAdapters(url, adapters).length > 0) {
      continue;
    }
    return "LOOKALIKE_HOST";
  }
  return null;
}

/**
 * Resolves a page URL to the adapter that may drive it.
 *
 * Matching is exact and structural: only HTTPS is ever considered, and each
 * adapter compares parsed host and path rather than doing substring tests, so
 * a hostile host that merely contains a supported name never matches.
 */
export class AdapterRegistry {
  private readonly adapters: FormAdapter[] = [];

  constructor(
    adapters: readonly FormAdapter[],
    private readonly fallback: FormAdapter,
  ) {
    for (const adapter of adapters) {
      this.register(adapter);
    }
  }

  private register(adapter: FormAdapter): void {
    if (this.adapters.some((a) => a.adapterId === adapter.adapterId)) {
      throw new Error(`Duplicate adapter ID: ${adapter.adapterId}`);
    }
    this.adapters.push(adapter);
  }

  /**
   * Classify a URL by downstream application-platform family and support tier.
   *
   * Operates on a single normalized HTTPS URL (query/fragment stripped).
   */
  classify(rawUrl: string): PlatformClassification | null {
    const url = normalizeClassificationUrl(rawUrl);
    if (!url) {
      return null;
    }

    if (isFeedListingHost(url)) {
      return {
        familyId: "feed_listing",
        supportTier: "UNSUPPORTED",
        reasonCode: "FEED_LISTING_UNRESOLVED",
        adapter: null,
      };
    }

    if (isWorkdayHost(url)) {
      return {
        familyId: "workday",
        supportTier: "UNSUPPORTED",
        reasonCode: "LEGAL_GATE",
        adapter: null,
      };
    }

    const lookalike = lookalikeReason(url, this.adapters);
    if (lookalike) {
      return {
        familyId: "lookalike",
        supportTier: "UNSUPPORTED",
        reasonCode: lookalike,
        adapter: null,
      };
    }

    const matches = matchingPlatformAdapters(url, this.adapters);
    if (matches.length > 1) {
      return {
        familyId: "ambiguous",
        supportTier: "UNSUPPORTED",
        reasonCode: "AMBIGUOUS_DETECTION",
        adapter: null,
      };
    }

    if (matches.length === 1) {
      const adapter = matches[0];
      return {
        familyId: adapter.capability.familyId,
        supportTier: adapter.capability.supportTier,
        reasonCode: adapter.capability.reasonCode,
        adapter,
      };
    }

    if (this.fallback.matches(url)) {
      return {
        familyId: this.fallback.capability.familyId,
        supportTier: this.fallback.capability.supportTier,
        reasonCode: this.fallback.capability.reasonCode,
        adapter: this.fallback,
      };
    }

    return {
      familyId: "unknown",
      supportTier: "UNSUPPORTED",
      reasonCode: "MISSING_ADAPTER_EVIDENCE",
      adapter: null,
    };
  }

  /**
   * The adapter for a URL.
   *
   * Platform adapters win over the generic one; anything not HTTPS resolves to
   * nothing at all, matching the navigation policy's refusal to load it.
   */
  resolve(rawUrl: string): FormAdapter | null {
    const classification = this.classify(rawUrl);
    if (!classification?.adapter) {
      return null;
    }
    if (
      classification.supportTier === "UNSUPPORTED" &&
      isHardVetoReason(classification.reasonCode)
    ) {
      return null;
    }
    return classification.adapter;
  }

  get registeredIds(): string[] {
    return this.adapters.map((a) => a.adapterId);
  }

  adapterById(adapterId: string): FormAdapter | null {
    if (this.fallback.adapterId === adapterId) {
      return this.fallback;
    }
    return this.adapters.find((adapter) => adapter.adapterId === adapterId) ?? null;
  }

  get fallbackAdapter(): FormAdapter {
    return this.fallback;
  }
}

/** Exact host match, or an exact subdomain of it. Never a substring test. */
export function hostMatches(url: URL, expectedHost: string): boolean {
  const host = url.hostname.toLowerCase();
  const expected = expectedHost.toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

/** Whether a classification blocks automation regardless of canonical URL. */
export function classificationVetoesAutomation(
  classification: PlatformClassification | null,
): classification is PlatformClassification {
  return (
    classification !== null &&
    classification.supportTier === "UNSUPPORTED" &&
    isHardVetoReason(classification.reasonCode)
  );
}

/** Map a hard veto to the runtime pause reason surfaced to the trusted UI. */
export function vetoToRuntimeReason(
  reasonCode: PlatformCoverageReasonCode,
): RuntimeReasonCode {
  return reasonCode;
}

/** Creates a registry populated with approved platform adapters and generic fallback. */
export function createDefaultAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry(
    [
      new GreenhouseFormAdapter(),
      new LeverFormAdapter(),
      new AshbyFormAdapter(),
      new SmartRecruitersFormAdapter(),
    ],
    new GenericFormAdapter(),
  );
}
