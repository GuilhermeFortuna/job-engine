import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { HARD_VETO_REASON_CODES } from "../../src/main/adapters/coverage";

const INVENTORY_PATH = path.resolve(
  __dirname,
  "../../../api/tests/fixtures/application_platform_inventory.json",
);

interface InventoryRow {
  source_id: string;
  sanitized_url: string;
  normalized_host: string;
  path_family: string;
  provider: string;
  observation_count: number;
  eligible: boolean;
  support_tier: string;
  reason: string | null;
  evidence_revision: string;
}

interface PathFamilyRow {
  source_id: string;
  normalized_host: string;
  path_family: string;
  provider: string;
  support_tier: string;
  reason: string | null;
  evidence_revision: string;
  count: number;
  share: number;
}

interface InventoryFile {
  evidence_revision: string;
  owner_inventory_decision: string;
  total_distinct_application_urls: number;
  total_distinct_path_families: number;
  total_source_url_count: number;
  resolvable_application_url_count: number;
  unresolvable_feed_listing_count: number;
  auto_supported_resolvable_count: number;
  pct_of_resolvable_application_urls: number | null;
  measurability_verdict: string;
  family_decisions: Record<string, { support_tier: string; reason: string | null }>;
  path_families: PathFamilyRow[];
  rows: InventoryRow[];
}

function loadInventory(): InventoryFile {
  return JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as InventoryFile;
}

const SOFT_REASONS = new Set(["UNAPPROVED_ATS_PATH"]);

describe("frozen application platform inventory", () => {
  const inventory = loadInventory();

  it("classifies every distinct sanitized URL without placeholders", () => {
    expect(inventory.rows.length).toBeGreaterThan(0);
    const seen = new Set<string>();
    for (const row of inventory.rows) {
      expect(seen.has(row.sanitized_url)).toBe(false);
      seen.add(row.sanitized_url);
      expect(row.support_tier).toMatch(
        /^(AUTO_SUPPORTED|ASSISTED_SUPPORTED|UNSUPPORTED)$/,
      );
      expect(row.provider).not.toMatch(/TBD|TO_BE_BOUND|UNKNOWN_PROVIDER/i);
      expect(row.sanitized_url).not.toMatch(/[?#]/);
      expect(row.sanitized_url).not.toMatch(/\/\/[^/]*@/);
      if (row.support_tier === "UNSUPPORTED") {
        expect(row.reason).toBeTruthy();
      }
    }
    expect(inventory.total_distinct_application_urls).toBe(inventory.rows.length);
  });

  it("separates nine distinct URLs from three path families for current fixtures", () => {
    expect(inventory.total_distinct_application_urls).toBe(9);
    expect(inventory.total_distinct_path_families).toBe(3);
    expect(inventory.path_families.length).toBe(3);
    expect(inventory.total_source_url_count).toBe(9);
  });

  it("uses only approved coverage reason codes", () => {
    const allowed = new Set<string>([
      ...HARD_VETO_REASON_CODES,
      ...SOFT_REASONS,
      "AUTH_REQUIRED",
      "CAPTCHA_REQUIRED",
      "UNSUPPORTED_CONTROL",
    ]);
    for (const row of inventory.rows) {
      if (row.reason) {
        expect(allowed.has(row.reason)).toBe(true);
      }
    }
  });

  it("matches summary arithmetic to observations and derived shares", () => {
    const observationTotal = inventory.path_families.reduce(
      (sum, row) => sum + row.count,
      0,
    );
    expect(inventory.total_source_url_count).toBe(observationTotal);
    expect(observationTotal).toBe(
      inventory.rows.reduce((sum, row) => sum + row.observation_count, 0),
    );

    const feedListing = inventory.rows
      .filter((row) => row.reason === "FEED_LISTING_UNRESOLVED")
      .reduce((sum, row) => sum + row.observation_count, 0);
    expect(inventory.unresolvable_feed_listing_count).toBe(feedListing);
    expect(inventory.resolvable_application_url_count).toBe(
      observationTotal - feedListing,
    );

    const autoSupported = inventory.rows
      .filter(
        (row) =>
          row.reason !== "FEED_LISTING_UNRESOLVED" &&
          row.support_tier === "AUTO_SUPPORTED",
      )
      .reduce((sum, row) => sum + row.observation_count, 0);
    expect(inventory.auto_supported_resolvable_count).toBe(autoSupported);

    for (const family of inventory.path_families) {
      const expectedShare =
        observationTotal === 0
          ? 0
          : Number((family.count / observationTotal).toFixed(6));
      expect(family.share).toBe(expectedShare);
    }

    if (inventory.resolvable_application_url_count === 0) {
      expect(inventory.pct_of_resolvable_application_urls).toBeNull();
      expect(inventory.measurability_verdict).toBe("option_c_escalation");
    } else {
      const expectedPct = Number(
        (
          (autoSupported / inventory.resolvable_application_url_count) *
          100
        ).toFixed(2),
      );
      expect(inventory.pct_of_resolvable_application_urls).toBe(expectedPct);
    }
  });

  it("groups path families with templated segments", () => {
    for (const row of inventory.path_families) {
      expect(row.path_family).not.toMatch(/\/\d+(\/|$)/);
    }
  });

  it("records explicit family decisions for inventoried ATS platforms", () => {
    for (const family of [
      "greenhouse",
      "lever",
      "generic_standard_html",
      "ashby",
      "smartrecruiters",
      "workday",
    ]) {
      expect(inventory.family_decisions[family]).toBeDefined();
      expect(inventory.family_decisions[family].support_tier).toMatch(
        /^(AUTO_SUPPORTED|ASSISTED_SUPPORTED|UNSUPPORTED)$/,
      );
    }
    expect(inventory.family_decisions.ashby.support_tier).toBe("UNSUPPORTED");
    expect(inventory.family_decisions.smartrecruiters.support_tier).toBe(
      "UNSUPPORTED",
    );
    expect(inventory.family_decisions.workday.reason).toBe("LEGAL_GATE");
  });

  it("publishes dual-number layout without a blended percentage when unresolvable", () => {
    expect(inventory.owner_inventory_decision).toContain("option_b");
    expect(inventory.unresolvable_feed_listing_count).toBeGreaterThan(0);
    if (inventory.resolvable_application_url_count === 0) {
      expect(inventory.pct_of_resolvable_application_urls).toBeNull();
    }
  });

  it("keeps JSON evidence revision aligned with row and family metadata", () => {
    expect(inventory.evidence_revision).toMatch(/^cross-014-v\d+$/);
    for (const row of inventory.rows) {
      expect(row.evidence_revision).toBe(inventory.evidence_revision);
    }
    for (const family of inventory.path_families) {
      expect(family.evidence_revision).toBe(inventory.evidence_revision);
    }
  });
});
