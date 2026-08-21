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

import { summarizeCoverage } from "./platform-coverage-metrics.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const OUT = path.join(
  ROOT,
  "apps/api/tests/fixtures/application_platform_inventory.json",
);

const EVIDENCE_REVISION = "cross-014-v5";

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
]);

const UNPROVEN_EXACT_ATS_HOSTS = new Map([
  ["jobs.ashbyhq.com", "ashby"],
  ["jobs.smartrecruiters.com", "smartrecruiters"],
]);

function normalizeUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  // Fail closed: only HTTPS inventory entries are accepted.
  if (url.protocol !== "https:") {
    return null;
  }
  if (url.username !== "" || url.password !== "") {
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
    throw new Error(
      `Malformed or non-HTTPS inventory URL for ${sourceId}: ${rawUrl}`,
    );
  }
  const host = url.hostname.toLowerCase();
  const sanitizedUrl = `${url.origin}${url.pathname}`.replace(/\/+$/, "") || url.origin;
  const family = pathFamily(url);
  const isFeedListing = [...FEED_LISTING_HOSTS].some(
    (listingHost) => host === listingHost || host.endsWith(`.${listingHost}`),
  );
  if (isFeedListing) {
    return {
      source_id: sourceId,
      sanitized_url: sanitizedUrl,
      normalized_host: host,
      path_family: family,
      provider: "feed_listing",
      eligible: false,
      support_tier: "UNSUPPORTED",
      reason: "FEED_LISTING_UNRESOLVED",
      evidence_revision: EVIDENCE_REVISION,
    };
  }

  if (host.endsWith("myworkdayjobs.com") || host === "myworkdayjobs.com") {
    return {
      source_id: sourceId,
      sanitized_url: sanitizedUrl,
      normalized_host: host,
      path_family: family,
      provider: "workday",
      eligible: false,
      support_tier: "UNSUPPORTED",
      reason: "LEGAL_GATE",
      evidence_revision: EVIDENCE_REVISION,
    };
  }

  const unproven = UNPROVEN_EXACT_ATS_HOSTS.get(host);
  if (unproven) {
    return {
      source_id: sourceId,
      sanitized_url: sanitizedUrl,
      normalized_host: host,
      path_family: family,
      provider: unproven,
      eligible: true,
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence_revision: EVIDENCE_REVISION,
    };
  }

  if (APPROVED_EXACT_ATS_HOSTS.has(host)) {
    let provider = "generic_standard_html";
    if (host.includes("greenhouse")) provider = "greenhouse";
    else if (host.includes("lever")) provider = "lever";
    return {
      source_id: sourceId,
      sanitized_url: sanitizedUrl,
      normalized_host: host,
      path_family: family,
      provider,
      eligible: true,
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence_revision: EVIDENCE_REVISION,
    };
  }

  // Unknown / unproven providers default closed — never invent AUTO_SUPPORTED.
  return {
    source_id: sourceId,
    sanitized_url: sanitizedUrl,
    normalized_host: host,
    path_family: family,
    provider: "unknown",
    eligible: true,
    support_tier: "UNSUPPORTED",
    reason: "MISSING_ADAPTER_EVIDENCE",
    evidence_revision: EVIDENCE_REVISION,
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

/**
 * One auditable row per distinct sanitized URL (query/fragment stripped).
 * Duplicate observations of the same URL increment observation_count.
 */
function distinctUrlRows(observations) {
  const byUrl = new Map();
  for (const row of observations) {
    const key = row.sanitized_url;
    const existing = byUrl.get(key);
    if (existing) {
      existing.observation_count += 1;
      continue;
    }
    byUrl.set(key, { ...row, observation_count: 1 });
  }
  return [...byUrl.values()].sort((a, b) =>
    a.sanitized_url.localeCompare(b.sanitized_url),
  );
}

/**
 * Separate path-family aggregation. Shares are derived from observation counts.
 */
function aggregatePathFamilies(observations) {
  const byFamily = new Map();
  for (const row of observations) {
    const key = `${row.source_id}|${row.path_family}|${row.provider}|${row.support_tier}|${row.reason}`;
    const existing = byFamily.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byFamily.set(key, {
        source_id: row.source_id,
        normalized_host: row.normalized_host,
        path_family: row.path_family,
        provider: row.provider,
        support_tier: row.support_tier,
        reason: row.reason,
        evidence_revision: row.evidence_revision,
        count: 1,
      });
    }
  }
  const aggregated = [...byFamily.values()].sort((a, b) =>
    `${a.source_id}|${a.path_family}`.localeCompare(
      `${b.source_id}|${b.path_family}`,
    ),
  );
  const total = aggregated.reduce((sum, row) => sum + row.count, 0);
  for (const row of aggregated) {
    row.share = total === 0 ? 0 : Number((row.count / total).toFixed(6));
  }
  return { aggregated, total };
}

const observations = [...loadHimalayas(), ...loadJobicy(), ...loadRemoteOk()];
const rows = distinctUrlRows(observations);
const { aggregated: pathFamilies, total: sourceObservationCount } =
  aggregatePathFamilies(observations);

const coverage = summarizeCoverage(rows);

const inventory = {
  evidence_revision: EVIDENCE_REVISION,
  owner_inventory_decision:
    "option_b_dual_number_reporting_with_vacuous_slice_fallback_to_c",
  owner_decision_source:
    "CROSS-014 planning session AskQuestion confirmation (2026-08-20)",
  total_distinct_application_urls: rows.length,
  total_distinct_path_families: pathFamilies.length,
  total_source_url_count: sourceObservationCount,
  resolvable_application_url_count: coverage.resolvableCount,
  unresolvable_feed_listing_count: coverage.unresolvableFeedListingCount,
  eligible_application_url_count: coverage.eligibleCount,
  excluded_resolvable_application_url_count:
    coverage.excludedResolvableCount,
  auto_supported_eligible_url_count: coverage.autoSupportedEligibleCount,
  pct_of_eligible_application_urls: coverage.percentage,
  measurability_verdict:
    coverage.eligibleCount === 0
      ? "option_c_escalation"
      : "measured_eligible_slice",
  measurability_note:
    coverage.eligibleCount === 0
      ? "All catalog application URLs in the committed source fixtures are feed listing hosts (himalayas.app, jobicy.com, remoteok.com). The >=95% criterion is unmeasurable against the current ingestion contract until downstream ATS URLs are stored or resolved. CROSS-014 is not acceptance-complete while that prerequisite remains."
      : "Eligible slice present; percentage is auto_supported_eligible_url_count / eligible_application_url_count. Resolvable URLs with missing adapter evidence remain eligible and lower coverage.",
  family_decisions: {
    generic_standard_html: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence:
        "Production-entrypoint smoke via test:production (CROSS-012 harness) plus CROSS-010 fixture corpus",
    },
    greenhouse: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence:
        "Production-entrypoint smoke via test:production plus CROSS-007 fixture corpus",
    },
    lever: {
      support_tier: "AUTO_SUPPORTED",
      reason: null,
      evidence:
        "Production-entrypoint smoke via test:production plus CROSS-008 fixture corpus",
    },
    ashby: {
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence:
        "Matcher module present but unregistered; exact jobs.ashbyhq.com hard-vetoed — does not count toward auto-supported coverage",
    },
    smartrecruiters: {
      support_tier: "UNSUPPORTED",
      reason: "MISSING_ADAPTER_EVIDENCE",
      evidence:
        "Matcher module present but unregistered; exact jobs.smartrecruiters.com hard-vetoed — does not count toward auto-supported coverage",
    },
    workday: {
      support_tier: "UNSUPPORTED",
      reason: "LEGAL_GATE",
      evidence:
        "platform_register RESEARCH_ONLY; mandatory tenant auth — does not count toward auto-supported coverage",
    },
    feed_listing: {
      support_tier: "UNSUPPORTED",
      reason: "FEED_LISTING_UNRESOLVED",
      evidence: "catalog stores listing URLs not downstream ATS apply hosts",
    },
  },
  path_families: pathFamilies,
  rows,
};

writeFileSync(OUT, `${JSON.stringify(inventory, null, 2)}\n`);
console.log(
  `Wrote ${OUT} (${rows.length} distinct URLs, ${pathFamilies.length} path families, ${sourceObservationCount} observations, resolvable=${coverage.resolvableCount}, eligible=${coverage.eligibleCount}, pct=${coverage.percentage})`,
);
