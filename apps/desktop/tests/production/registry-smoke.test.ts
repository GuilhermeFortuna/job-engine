import { describe, expect, it } from "vitest";

import { createDefaultAdapterRegistry } from "../../src/main/adapters/registry";

/**
 * Production-path registry smoke.
 *
 * Full Electron coordinator smokes through dist/main/index.js are owned by
 * CROSS-012. This project verifies the compiled adapter registry that the
 * production coordinator will import once CROSS-012 wires it.
 */
describe("production adapter registry smoke", () => {
  it("classifies approved ATS and feed listing URLs from the compiled module graph", () => {
    const registry = createDefaultAdapterRegistry();
    expect(
      registry.classify("https://boards.greenhouse.io/acme/jobs/12345")?.familyId,
    ).toBe("greenhouse");
    expect(
      registry.classify("https://jobs.lever.co/acme/role/apply")?.familyId,
    ).toBe("lever");
    expect(
      registry.classify("https://himalayas.app/companies/acme/jobs/staff")?.reasonCode,
    ).toBe("FEED_LISTING_UNRESOLVED");
    expect(registry.resolve("https://jobs.eu.lever.co/acme/apply")).toBeNull();
  });
});
