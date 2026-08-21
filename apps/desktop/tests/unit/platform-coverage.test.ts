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
  normalized_host: string;
  path_family: string;
  provider: string;
  count: number;
  share: number;
  eligible: boolean;
  support_tier: string;
  reason: string | null;
  evidence_revision: string;
}

interface InventoryFile {
  evidence_revision: string;
  owner_inventory_decision: string;
  total_distinct_application_urls: number;
  total_source_url_count: number;
  resolvable_application_url_count: number;
  unresolvable_feed_listing_count: number;
  auto_supported_resolvable_count: number;
  pct_of_resolvable_application_urls: number | null;
  measurability_verdict: string;
  family_decisions: Record<string, { support_tier: string; reason: string | null }>;
  rows: InventoryRow[];
}

function loadInventory(): InventoryFile {
  return JSON.parse(readFileSync(INVENTORY_PATH, "utf8")) as InventoryFile;
}

const SOFT_REASONS = new Set(["UNAPPROVED_ATS_PATH"]);

describe("frozen application platform inventory", () => {
  const inventory = loadInventory();

  it("classifies every catalog row without placeholders", () => {
    expect(inventory.rows.length).toBeGreaterThan(0);
    for (const row of inventory.rows) {
      expect(row.support_tier).toMatch(
        /^(AUTO_SUPPORTED|ASSISTED_SUPPORTED|UNSUPPORTED)$/,
      );
      expect(row.provider).not.toMatch(/TBD|TO_BE_BOUND|UNKNOWN_PROVIDER/i);
      if (row.support_tier === "UNSUPPORTED") {
        expect(row.reason).toBeTruthy();
      }
    }
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

  it("matches summary arithmetic to row counts", () => {
    const sourceTotal = inventory.rows.reduce((sum, row) => sum + row.count, 0);
    expect(inventory.total_source_url_count).toBe(sourceTotal);
    expect(inventory.total_distinct_application_urls).toBe(inventory.rows.length);

    const feedListing = inventory.rows
      .filter((row) => row.reason === "FEED_LISTING_UNRESOLVED")
      .reduce((sum, row) => sum + row.count, 0);
    expect(inventory.unresolvable_feed_listing_count).toBe(feedListing);
    expect(inventory.resolvable_application_url_count).toBe(
      sourceTotal - feedListing,
    );

    const autoSupported = inventory.rows
      .filter(
        (row) =>
          row.reason !== "FEED_LISTING_UNRESOLVED" &&
          row.support_tier === "AUTO_SUPPORTED",
      )
      .reduce((sum, row) => sum + row.count, 0);
    expect(inventory.auto_supported_resolvable_count).toBe(autoSupported);

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
    for (const row of inventory.rows) {
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
  });

  it("publishes dual-number layout without a blended percentage when unresolvable", () => {
    expect(inventory.owner_inventory_decision).toContain("option_b");
    expect(inventory.unresolvable_feed_listing_count).toBeGreaterThan(0);
    if (inventory.resolvable_application_url_count === 0) {
      expect(inventory.pct_of_resolvable_application_urls).toBeNull();
    }
  });
});
