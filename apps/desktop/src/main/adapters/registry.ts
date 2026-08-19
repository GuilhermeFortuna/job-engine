import type { FormAdapter } from "./contract";
import { GenericFormAdapter } from "./generic";
import { GreenhouseFormAdapter } from "./greenhouse";

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
   * The adapter for a URL.
   *
   * Platform adapters win over the generic one; anything not HTTPS resolves to
   * nothing at all, matching the navigation policy's refusal to load it.
   */
  resolve(rawUrl: string): FormAdapter | null {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    if (url.protocol !== "https:") {
      return null;
    }
    for (const adapter of this.adapters) {
      if (adapter.matches(url)) {
        return adapter;
      }
    }
    return this.fallback.matches(url) ? this.fallback : null;
  }

  get registeredIds(): string[] {
    return this.adapters.map((a) => a.adapterId);
  }
}

/** Exact host match, or an exact subdomain of it. Never a substring test. */
export function hostMatches(url: URL, expectedHost: string): boolean {
  const host = url.hostname.toLowerCase();
  const expected = expectedHost.toLowerCase();
  return host === expected || host.endsWith(`.${expected}`);
}

/** Creates a registry populated with approved platform adapters and generic fallback. */
export function createDefaultAdapterRegistry(): AdapterRegistry {
  return new AdapterRegistry(
    [new GreenhouseFormAdapter()],
    new GenericFormAdapter(),
  );
}
