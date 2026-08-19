import Link from "next/link";
import { ApplicationLauncher } from "@/features/applications/components/ApplicationLauncher";
import { Badge } from "@/components/ui/badge";
import { ShimmerAnchor } from "@/components/ui/shimmer-button";
import type {
  Compensation,
  JobListItem,
  LocationEligibility,
  RemoteStatus,
  Seniority,
} from "../types";
import { JobCardShell } from "./JobCardShell";

export function formatRemoteStatus(status: RemoteStatus): string {
  switch (status) {
    case "remote":
      return "Remote";
    case "hybrid":
      return "Hybrid";
    case "onsite":
      return "On-site";
    default:
      return "Remote: Unknown";
  }
}

export function formatSeniority(seniority: Seniority): string {
  switch (seniority) {
    case "internship":
      return "Internship";
    case "junior":
      return "Junior";
    case "mid":
      return "Mid-level";
    case "senior":
      return "Senior";
    case "lead_staff":
      return "Lead / Staff";
    default:
      return "Seniority: Unknown";
  }
}

export function formatRegion(region: string): string {
  switch (region) {
    case "brazil":
      return "Brazil";
    case "latin_america":
      return "Latin America";
    case "worldwide":
      return "Worldwide";
    default:
      return region;
  }
}

export function formatLocationEligibility(
  eligibility: LocationEligibility,
): string {
  if (eligibility.unknown || !eligibility.regions || eligibility.regions.length === 0) {
    return "Eligibility: Unknown";
  }
  const parts = eligibility.regions.map((item) => {
    const reg = formatRegion(item.region);
    return item.evidence_text ? `${reg} (${item.evidence_text})` : reg;
  });
  return `Eligible: ${parts.join(", ")}`;
}

const BLOCK_TAG_RE =
  /<\/?(?:p|div|br|h[1-6]|li|ul|ol|tr|td|th|table|section|article|blockquote)[^>]*>/gi;
const ANY_TAG_RE = /<[^>]+>/g;
const SCRIPT_RE = /<script[\s\S]*?<\/script>/gi;
const STYLE_RE = /<style[\s\S]*?<\/style>/gi;

export function htmlToPlainText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const decoded = value
    .replace(SCRIPT_RE, " ")
    .replace(STYLE_RE, " ")
    .replace(BLOCK_TAG_RE, " ")
    .replace(ANY_TAG_RE, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
  return decoded || null;
}

export function formatUsdAmount(val: string | null): string | null {
  if (!val) return null;
  const num = Number(val);
  if (Number.isNaN(num)) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(num);
}

function displayableOriginalCompensation(text: string | null): string | null {
  const original = text?.trim();
  if (!original || !/\d/.test(original)) {
    return null;
  }
  return original;
}

export function formatCompensation(comp: Compensation): string {
  const original = displayableOriginalCompensation(comp.original_text);
  const minUsd = formatUsdAmount(comp.annual_usd_minimum);
  const maxUsd = formatUsdAmount(comp.annual_usd_maximum);

  let normalizedUsd: string | null = null;
  if (minUsd && maxUsd) {
    normalizedUsd = minUsd === maxUsd ? `${minUsd}/yr` : `${minUsd} – ${maxUsd}/yr`;
  } else if (minUsd) {
    normalizedUsd = `from ${minUsd}/yr`;
  } else if (maxUsd) {
    normalizedUsd = `up to ${maxUsd}/yr`;
  }

  if (original && normalizedUsd) {
    // If original already mentions the exact normalized USD, return original
    if (original.includes(normalizedUsd)) {
      return original;
    }
    return `${original} (~${normalizedUsd})`;
  }

  if (original) {
    return original;
  }

  if (normalizedUsd) {
    return normalizedUsd;
  }

  return "Compensation not provided";
}

export function formatDate(dateString: string | null): string {
  if (!dateString) return "Unknown";
  try {
    const d = new Date(dateString);
    if (Number.isNaN(d.getTime())) return "Unknown";
    return d.toISOString().split("T")[0];
  } catch {
    return "Unknown";
  }
}

export function JobCard({ job }: { job: JobListItem }) {
  const locationText =
    job.location_original?.trim() ||
    [job.location_normalized_region, job.location_normalized_country]
      .filter(Boolean)
      .join(", ") ||
    "Location not specified";

  const compensationText = formatCompensation(job.compensation);
  const eligibilityText = formatLocationEligibility(job.location_eligibility);
  const excerptText = htmlToPlainText(job.description_excerpt);
  const postedDateIso = job.published_at || job.first_seen_at;
  const postedDateFormatted = formatDate(postedDateIso);
  const lastSeenFormatted = formatDate(job.last_seen_at);

  return (
    <JobCardShell>
      <article className="flex flex-col gap-4 p-5" aria-labelledby={`job-title-${job.id}`}>
        <header className="flex flex-col gap-2">
          <div>
            <h2 id={`job-title-${job.id}`} className="m-0 text-xl font-semibold tracking-tight">
              <Link href={`/jobs/${job.id}`} className="hover:text-ring hover:underline">
                {job.title}
              </Link>
            </h2>
            <p className="m-0 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{job.company}</span>
              <span className="location-sep" aria-hidden="true">
                {" "}
                •{" "}
              </span>
              <span className="location-text">{locationText}</span>
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge variant="remote">{formatRemoteStatus(job.remote_status)}</Badge>
            <Badge variant="secondary">{formatSeniority(job.seniority)}</Badge>
            <Badge variant="eligibility">{eligibilityText}</Badge>
          </div>
        </header>

        <div className="flex flex-col gap-3">
          <p
            className={
              compensationText === "Compensation not provided"
                ? "m-0 text-[0.9375rem] font-medium text-muted-foreground italic"
                : "m-0 text-[0.9375rem] font-semibold text-emerald-700 dark:text-emerald-400"
            }
          >
            <span className="comp-label sr-only">Compensation: </span>
            {compensationText}
          </p>

          {excerptText && (
            <p className="m-0 text-sm leading-relaxed text-foreground">{excerptText}</p>
          )}

          {job.technologies && job.technologies.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label="Required technologies">
              {job.technologies.map((t) => (
                <Badge key={t.term} variant="tech">
                  {t.term}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <footer className="flex flex-col gap-3 border-t border-border pt-3 text-[0.8125rem] text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="font-mono text-xs">
            <span>
              Posted:{" "}
              <time dateTime={postedDateIso ?? undefined}>
                {postedDateFormatted}
              </time>
            </span>
            <span className="date-sep" aria-hidden="true">
              {" "}
              •{" "}
            </span>
            <span>
              Last seen:{" "}
              <time dateTime={job.last_seen_at}>{lastSeenFormatted}</time>
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-1" aria-label="Available on sources">
              <span className="text-xs text-muted-foreground">Sources:</span>
              {job.sources.map((s) => (
                <Badge key={s.source_id} variant="source">
                  {s.source_name}
                </Badge>
              ))}
            </div>

            {job.primary_application_url && (
              <div className="flex flex-wrap items-center gap-2">
                <ShimmerAnchor
                  href={job.primary_application_url}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Apply on {job.sources[0]?.source_name ?? "Source"}{" "}
                  <span aria-hidden="true">↗</span>
                  <span className="sr-only"> (opens in new tab)</span>
                </ShimmerAnchor>
                <ApplicationLauncher
                  jobGroupId={job.id}
                  title={job.title}
                  company={job.company}
                  applicationUrl={job.primary_application_url}
                  sourceName={job.sources[0]?.source_name ?? "Source"}
                />
              </div>
            )}
          </div>
        </footer>
      </article>
    </JobCardShell>
  );
}
