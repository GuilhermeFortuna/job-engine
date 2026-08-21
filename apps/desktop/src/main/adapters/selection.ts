import type { RuntimeReasonCode } from "../../shared/contracts";
import type { FormAdapter } from "./contract";
import { coverageReasonToRuntime, isHardVetoReason } from "./coverage";
import {
  AdapterRegistry,
  classificationVetoesAutomation,
  GENERIC_ADAPTER_ID,
  normalizeClassificationUrl,
} from "./registry";

export interface AdapterSelectionInput {
  platform_adapter_id: string;
  canonical_application_url?: string | null;
  application_url: string;
}

export interface AdapterSelectionResult {
  adapter: FormAdapter | null;
  vetoReason: RuntimeReasonCode | null;
}

/** Loopback fixture hosts used by production and fixture smokes. */
export function isLoopbackUrl(rawUrl: string): boolean {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Select the adapter that may drive the visible embedded page.
 *
 * A hard veto on the visible URL is unconditional and is never overridden by
 * canonical_application_url or the loopback platform_adapter_id override.
 *
 * RuntimeCoordinator's private `selectAdapter` delegates here so coverage
 * veto/selection stays in the adapters package.
 */
export function selectAdapter(
  registry: AdapterRegistry,
  run: AdapterSelectionInput,
  visibleUrl: string,
): AdapterSelectionResult {
  const visibleClass = registry.classify(visibleUrl);
  if (classificationVetoesAutomation(visibleClass)) {
    return {
      adapter: null,
      vetoReason: coverageReasonToRuntime(visibleClass.reasonCode!),
    };
  }

  const visibleResolved = registry.resolve(visibleUrl);
  if (visibleResolved && visibleResolved.adapterId !== GENERIC_ADAPTER_ID) {
    return { adapter: visibleResolved, vetoReason: null };
  }

  const canonicalRaw = run.canonical_application_url;
  if (canonicalRaw) {
    const canonicalClass = registry.classify(canonicalRaw);
    if (classificationVetoesAutomation(canonicalClass)) {
      return {
        adapter: null,
        vetoReason: coverageReasonToRuntime(canonicalClass.reasonCode!),
      };
    }
    const canonicalResolved = registry.resolve(canonicalRaw);
    if (canonicalResolved && canonicalResolved.adapterId !== GENERIC_ADAPTER_ID) {
      return { adapter: canonicalResolved, vetoReason: null };
    }
  }

  if (isLoopbackUrl(visibleUrl)) {
    const named = registry.adapterById(run.platform_adapter_id);
    if (named) {
      // Loopback must still respect capability hard vetoes (finding 9).
      if (
        named.capability.supportTier === "UNSUPPORTED" &&
        isHardVetoReason(named.capability.reasonCode)
      ) {
        return {
          adapter: null,
          vetoReason: coverageReasonToRuntime(named.capability.reasonCode!),
        };
      }
      return { adapter: named, vetoReason: null };
    }
  }

  const fallbackUrl = canonicalRaw ?? visibleUrl;
  const fallbackClass = registry.classify(fallbackUrl);
  if (classificationVetoesAutomation(fallbackClass)) {
    return {
      adapter: null,
      vetoReason: coverageReasonToRuntime(fallbackClass.reasonCode!),
    };
  }

  return {
    adapter: registry.resolve(fallbackUrl),
    vetoReason: null,
  };
}

/**
 * Normalized host + templated path family for inventory grouping.
 * Collapses numeric/id/slug segments so distinct jobs share a family row.
 */
export function inventoryPathFamily(rawUrl: string): string | null {
  const url = normalizeClassificationUrl(rawUrl);
  if (!url) {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const raw = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segments: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const segment = raw[i];
    if (/^\d+$/.test(segment)) {
      segments.push("{id}");
      continue;
    }
    if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(segment)) {
      segments.push("{uuid}");
      continue;
    }
    if (/^\d+-[a-z0-9-]+$/i.test(segment)) {
      segments.push("{id}-{slug}");
      continue;
    }
    if (
      (raw[i - 1] === "companies" || raw[i - 1] === "jobs") &&
      /^[a-z0-9-]+$/i.test(segment)
    ) {
      segments.push("{slug}");
      continue;
    }
    segments.push(segment);
  }
  return `${host}/${segments.join("/") || ""}`.replace(/\/$/, "") || host;
}
