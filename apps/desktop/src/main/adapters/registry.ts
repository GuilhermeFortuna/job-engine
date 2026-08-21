import type {
  FormAdapter,
  PlatformClassification,
  PlatformCoverageReasonCode,
} from "./contract";
import { isHardVetoReason } from "./coverage";
import { GENERIC_ADAPTER_ID, GenericFormAdapter } from "./generic";
import {
  APPROVED_GREENHOUSE_HOSTS,
  GreenhouseFormAdapter,
} from "./greenhouse";
import { APPROVED_LEVER_HOST, LeverFormAdapter } from "./lever";
import { isWorkdayHost } from "./workday";

/** Feed listing hosts stored by approved job sources — not downstream ATS apply URLs. */
export const FEED_LISTING_HOSTS: readonly string[] = Object.freeze([
  "himalayas.app",
  "jobicy.com",
  "remoteok.com",
]);

/**
 * Approved ATS apex domains. Used with {@link hostMatches} and infix checks to
 * detect hostile lookalikes — never as a substitute for exact host+path matching.
 */
export const ATS_APEX_DOMAINS: readonly string[] = Object.freeze([
  "greenhouse.io",
  "lever.co",
  "ashbyhq.com",
  "smartrecruiters.com",
  "myworkdayjobs.com",
]);

/**
 * Exact first-party hosts that are approved for a registered platform adapter.
 * A suffix match on the apex that is NOT in this set is either unbound
 * first-party or a lookalike — never a silent generic drive of ATS chrome.
 */
export const APPROVED_EXACT_ATS_HOSTS: readonly string[] = Object.freeze([
  ...APPROVED_GREENHOUSE_HOSTS,
  APPROVED_LEVER_HOST,
  "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com",
]);

/**
 * Documented first-party ATS hosts that are unbound (no adapter path approved).
 * Not lookalikes — genuine platforms that must not be driven and must not be
 * mislabelled as hostile.
 */
export const UNBOUND_FIRST_PARTY_ATS_HOSTS: readonly string[] = Object.freeze([
  "jobs.eu.lever.co",
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

function isApprovedExactAtsHost(host: string): boolean {
  return APPROVED_EXACT_ATS_HOSTS.includes(host);
}

function isUnboundFirstPartyAtsHost(host: string): boolean {
  return UNBOUND_FIRST_PARTY_ATS_HOSTS.includes(host);
}

/**
 * Hostile lookalike: apex infix injection (boards.greenhouse.io.evil.test) or
 * a suffix match on an ATS apex that is neither an approved exact host nor a
 * documented unbound first-party host.
 */
function hostileLookalikeReason(url: URL): PlatformCoverageReasonCode | null {
  const host = url.hostname.toLowerCase();
  for (const apex of ATS_APEX_DOMAINS) {
    // Infix label injection: ….<apex>.attacker.tld
    if (host.includes(`.${apex}.`)) {
      return "LOOKALIKE_HOST";
    }
    if (!hostMatches(url, apex)) {
      continue;
    }
    if (isApprovedExactAtsHost(host) || isUnboundFirstPartyAtsHost(host)) {
      continue;
    }
    // e.g. evil.boards.greenhouse.io or careers.lever.co impostors
    return "LOOKALIKE_HOST";
  }
  return null;
}

/**
 * Exact approved ATS host whose path is outside the registered adapter matcher.
 * Soft: inventory records UNAPPROVED_ATS_PATH; runtime falls through to generic.
 */
function isApprovedHostUnapprovedPath(
  url: URL,
  adapters: readonly FormAdapter[],
): boolean {
  const host = url.hostname.toLowerCase();
  if (!isApprovedExactAtsHost(host)) {
    return false;
  }
  return matchingPlatformAdapters(url, adapters).length === 0;
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

    const host = url.hostname.toLowerCase();
    if (isUnboundFirstPartyAtsHost(host)) {
      return {
        familyId: "unbound_ats",
        supportTier: "UNSUPPORTED",
        reasonCode: "MISSING_ADAPTER_EVIDENCE",
        adapter: null,
      };
    }

    const lookalike = hostileLookalikeReason(url);
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

    // Approved ATS host, unproven path → soft reason, generic fallback.
    if (isApprovedHostUnapprovedPath(url, this.adapters) && this.fallback.matches(url)) {
      return {
        familyId: this.fallback.capability.familyId,
        supportTier: this.fallback.capability.supportTier,
        reasonCode: "UNAPPROVED_ATS_PATH",
        adapter: this.fallback,
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

/**
 * Creates a registry with proven AUTO_SUPPORTED platform adapters and generic
 * fallback. Ashby and SmartRecruiters stay unregistered so generic keeps
 * handling those hosts until production-entrypoint evidence exists (CROSS-014
 * forbidden decision: do not add speculative adapters that hard-veto coverage).
 */
export function createDefaultAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry(
    [new GreenhouseFormAdapter(), new LeverFormAdapter()],
    new GenericFormAdapter(),
  );
}

export { GENERIC_ADAPTER_ID };
