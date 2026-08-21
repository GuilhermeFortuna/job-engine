export interface CoverageMetricRow {
  eligible: boolean;
  support_tier: string;
  reason: string | null;
}

export interface CoverageMetrics {
  resolvableCount: number;
  unresolvableFeedListingCount: number;
  eligibleCount: number;
  excludedResolvableCount: number;
  autoSupportedEligibleCount: number;
  percentage: number | null;
}

export function summarizeCoverage(
  rows: readonly CoverageMetricRow[],
): CoverageMetrics;
