#!/usr/bin/env node
/**
 * Generates the frozen application-platform inventory JSON from committed
 * source API fixtures. Run manually when catalog fixtures change:
 *
 *   node apps/desktop/scripts/generate-platform-inventory.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(
  ROOT,
  "apps/api/tests/fixtures/application_platform_inventory.json",
);

const FEED_LISTING_HOSTS = new Set([
  "himalayas.app",
  "jobicy.com",
  "remoteok.com",
]);

function normalizeUrl(rawUrl) {
  const url = new URL(rawUrl);
  url.hash = "";
  url.search = "";
  return url;
}

function pathFamily(url) {
  return `${url.hostname.toLowerCase()}${url.pathname.replace(/\/+$/, "") || "/"}`;
}

function classifyListingUrl(sourceId, rawUrl) {
  const url = normalizeUrl(rawUrl);
  const host = url.hostname.toLowerCase();
  const isFeedListing = [...FEED_LISTING_HOSTS].some(
    (listingHost) => host === listingHost || host.endsWith(`.${listingHost}`),
  );
  return {
    source_id: sourceId,
    normalized_host: host,
    path_family: pathFamily(url),
    provider: isFeedListing ? "feed_listing" : "unknown",
    eligible: false,
    support_tier: "UNSUPPORTED",
    reason: isFeedListing ? "FEED_LISTING_UNRESOLVED" : "MISSING_ADAPTER_EVIDENCE",
    evidence_revision: "cross-014-v1",
  };
}

function loadHimalayas() {
  const file = path.join(
    ROOT,
    "apps/api/tests/sources/fixtures/himalayas/success.json",
  );
  const payload = JSON.parse(readFileSync(file, "utf8"));
  return payload.jobs.map((job) =>
    classifyListingUrl("himalayas", job.applicationLink),
  );
}

function loadJobicy() {
  const file = path.join(
    ROOT,
    "apps/api/tests/sources/fixtures/jobicy/success.json",
  );
  const payload = JSON.parse(readFileSync(file, "utf8"));
  return payload.jobs.map((job) => classifyListingUrl("jobicy", job.url));
}

function loadRemoteOk() {
  const file = path.join(
    ROOT,
    "apps/api/tests/sources/fixtures/remoteok/success.json",
  );
  const payload = JSON.parse(readFileSync(file, "utf8"));
  return payload
    .filter((entry) => entry.url)
    .map((job) => classifyListingUrl("remoteok", job.url));
}

function aggregateRows(rows) {
  const byFamily = new Map();
  for (const row of rows) {
    const key = `${row.source_id}|${row.path_family}`;
    const existing = byFamily.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byFamily.set(key, { ...row, count: 1 });
    }
  }
  const aggregated = [...byFamily.values()];
  const total = aggregated.reduce((sum, row) => sum + row.count, 0);
  for (const row of aggregated) {
    row.share = total === 0 ? 0 : row.count / total;
  }
  return { aggregated, total };
}

const rows = [...loadHimalayas(), ...loadJobicy(), ...loadRemoteOk()];
const { aggregated, total } = aggregateRows(rows);
const unresolvable = aggregated.filter(
  (row) => row.reason === "FEED_LISTING_UNRESOLVED",
).length;
const resolvableCount = aggregated.length - unresolvable;

const inventory = {
  evidence_revision: "cross-014-v1",
  owner_inventory_decision:
    "option_b_dual_number_reporting_with_vacuous_slice_fallback_to_c",
  total_distinct_application_urls: aggregated.length,
  resolvable_application_url_count: resolvableCount,
  unresolvable_feed_listing_count: unresolvable,
  auto_supported_resolvable_count: 0,
  pct_of_resolvable_application_urls:
    resolvableCount > 0 ? 0 : null,
  measurability_verdict:
    resolvableCount === 0 ? "option_c_escalation" : "pending_resolvable_audit",
  measurability_note:
    resolvableCount === 0
      ? "All catalog application URLs in the committed source fixtures are feed listing hosts (himalayas.app, jobicy.com, remoteok.com). The >=95% criterion is unmeasurable against the current ingestion contract until downstream ATS URLs are stored or resolved."
      : "Resolvable slice present; run production-entrypoint evidence before publishing pct_of_resolvable_application_urls.",
  family_decisions: {
    generic_standard_html: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence: "fixture_corpus; production_entrypoint pending CROSS-012",
    },
    greenhouse: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence: "adapter_unit_and_fixture_corpus; production_entrypoint pending CROSS-012",
    },
    lever: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence: "adapter_unit_and_fixture_corpus; production_entrypoint pending CROSS-012",
    },
    ashby: {
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence: "exact_host_matcher_registered; no production smoke",
    },
    smartrecruiters: {
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence: "exact_host_matcher_registered; no production smoke",
    },
    workday: {
      support_tier: "UNSUPPORTED",
      reason: "LEGAL_GATE",
      evidence: "platform_register RESEARCH_ONLY; mandatory tenant auth",
    },
    feed_listing: {
      support_tier: "UNSUPPORTED",
      reason: "FEED_LISTING_UNRESOLVED",
      evidence: "catalog stores listing URLs not downstream ATS apply hosts",
    },
  },
  rows: aggregated,
  source_row_total: total,
};

writeFileSync(OUT, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(`Wrote ${OUT} (${aggregated.length} distinct families, ${total} source rows)`);
