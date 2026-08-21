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

const APPROVED_EXACT_ATS_HOSTS = new Set([
  "boards.greenhouse.io",
  "job-boards.greenhouse.io",
  "boards.eu.greenhouse.io",
  "jobs.lever.co",
  "jobs.ashbyhq.com",
  "jobs.smartrecruiters.com",
]);

function normalizeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    return null;
  }
  url.hash = "";
  url.search = "";
  return url;
}

function pathFamily(url) {
  const host = url.hostname.toLowerCase();
  const raw = url.pathname.replace(/\/+$/, "").split("/").filter(Boolean);
  const segments = [];
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
    // Himalayas / employer board: /companies/{slug}/jobs/{slug}
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

function classifyListingUrl(sourceId, rawUrl) {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return {
      source_id: sourceId,
      normalized_host: "invalid",
      path_family: "invalid",
      provider: "unknown",
      eligible: false,
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence_revision: "cross-014-v2",
    };
  }
  const host = url.hostname.toLowerCase();
  const isFeedListing = [...FEED_LISTING_HOSTS].some(
    (listingHost) => host === listingHost || host.endsWith(`.${listingHost}`),
  );
  if (isFeedListing) {
    return {
      source_id: sourceId,
      normalized_host: host,
      path_family: pathFamily(url),
      provider: "feed_listing",
      eligible: false,
      support_tier: "UNSUPPORTED",
      reason: "FEED_LISTING_UNRESOLVED",
      evidence_revision: "cross-014-v2",
    };
  }

  let provider = "generic_standard_html";
  let supportTier = "AUTO_SUPPORTED";
  let reason = null;
  if (host.endsWith("myworkdayjobs.com") || host === "myworkdayjobs.com") {
    provider = "workday";
    supportTier = "UNSUPPORTED";
    reason = "LEGAL_GATE";
  } else if (APPROVED_EXACT_ATS_HOSTS.has(host)) {
    if (host.includes("greenhouse")) provider = "greenhouse";
    else if (host.includes("lever")) provider = "lever";
    else if (host.includes("ashby")) provider = "ashby";
    else if (host.includes("smartrecruiters")) provider = "smartrecruiters";
  }

  return {
    source_id: sourceId,
    normalized_host: host,
    path_family: pathFamily(url),
    provider,
    eligible: supportTier === "AUTO_SUPPORTED",
    support_tier: supportTier,
    reason,
    evidence_revision: "cross-014-v2",
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
    const key = `${row.source_id}|${row.path_family}|${row.provider}|${row.support_tier}|${row.reason}`;
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
    row.share = total === 0 ? 0 : Number((row.count / total).toFixed(6));
  }
  return { aggregated, total };
}

const rows = [...loadHimalayas(), ...loadJobicy(), ...loadRemoteOk()];
const { aggregated, total } = aggregateRows(rows);
const unresolvable = aggregated
  .filter((row) => row.reason === "FEED_LISTING_UNRESOLVED")
  .reduce((sum, row) => sum + row.count, 0);
const resolvableRows = aggregated.filter(
  (row) => row.reason !== "FEED_LISTING_UNRESOLVED",
);
const resolvableCount = resolvableRows.reduce((sum, row) => sum + row.count, 0);
const autoSupportedResolvable = resolvableRows
  .filter((row) => row.support_tier === "AUTO_SUPPORTED")
  .reduce((sum, row) => sum + row.count, 0);
const pct =
  resolvableCount > 0
    ? Number(((autoSupportedResolvable / resolvableCount) * 100).toFixed(2))
    : null;

const inventory = {
  evidence_revision: "cross-014-v2",
  owner_inventory_decision:
    "option_b_dual_number_reporting_with_vacuous_slice_fallback_to_c",
  owner_decision_source:
    "CROSS-014 planning session AskQuestion confirmation (2026-08-20)",
  total_distinct_application_urls: aggregated.length,
  total_source_url_count: total,
  resolvable_application_url_count: resolvableCount,
  unresolvable_feed_listing_count: unresolvable,
  auto_supported_resolvable_count: autoSupportedResolvable,
  pct_of_resolvable_application_urls: pct,
  measurability_verdict:
    resolvableCount === 0 ? "option_c_escalation" : "measured_resolvable_slice",
  measurability_note:
    resolvableCount === 0
      ? "All catalog application URLs in the committed source fixtures are feed listing hosts (himalayas.app, jobicy.com, remoteok.com). The >=95% criterion is unmeasurable against the current ingestion contract until downstream ATS URLs are stored or resolved."
      : "Resolvable slice present; percentage is auto_supported_resolvable_count / resolvable_application_url_count.",
  family_decisions: {
    generic_standard_html: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence:
        "CROSS-010 fixture corpus; production-entrypoint smoke owned by CROSS-012 when landed",
    },
    greenhouse: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence:
        "CROSS-007 unit + fixture corpus; production-entrypoint smoke owned by CROSS-012 when landed",
    },
    lever: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence:
        "CROSS-008 unit + fixture corpus; production-entrypoint smoke owned by CROSS-012 when landed",
    },
    ashby: {
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence:
        "Matcher module present but unregistered — generic keeps handling until production smoke",
    },
    smartrecruiters: {
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence:
        "Matcher module present but unregistered — generic keeps handling until production smoke",
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
};

writeFileSync(OUT, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Wrote ${OUT} (${aggregated.length} families, ${total} source URLs, resolvable=${resolvableCount}, pct=${pct})`,
);
