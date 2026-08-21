/**
 * Compute CROSS-014 coverage over distinct application URLs.
 *
 * Resolvability and eligibility are deliberately separate. A resolvable URL
 * with missing adapter evidence still belongs in the eligible denominator;
 * only a documented exclusion may remove it.
 */
export function summarizeCoverage(rows) {
  const resolvableRows = rows.filter(
    (row) => row.reason !== "FEED_LISTING_UNRESOLVED",
  );
  const allowedExclusionReasons = new Set([
    "AUTH_REQUIRED",
    "CAPTCHA_REQUIRED",
    "UNSUPPORTED_CONTROL",
    "LEGAL_GATE",
    "PLATFORM_DRIFT",
  ]);
  for (const row of resolvableRows) {
    if (!row.eligible && !allowedExclusionReasons.has(row.reason)) {
      throw new Error(
        `Invalid CROSS-014 eligibility exclusion: ${String(row.reason)}`,
      );
    }
  }
  const eligibleRows = resolvableRows.filter((row) => row.eligible);
  const autoSupportedEligibleRows = eligibleRows.filter(
    (row) => row.support_tier === "AUTO_SUPPORTED",
  );

  const eligibleCount = eligibleRows.length;
  return {
    resolvableCount: resolvableRows.length,
    unresolvableFeedListingCount: rows.length - resolvableRows.length,
    eligibleCount,
    excludedResolvableCount: resolvableRows.length - eligibleCount,
    autoSupportedEligibleCount: autoSupportedEligibleRows.length,
    percentage:
      eligibleCount === 0
        ? null
        : Number(
            ((autoSupportedEligibleRows.length / eligibleCount) * 100).toFixed(
              2,
            ),
          ),
  };
}
