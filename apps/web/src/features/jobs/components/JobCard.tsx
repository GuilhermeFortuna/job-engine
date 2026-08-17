import Link from "next/link";
import type {
  Compensation,
  JobListItem,
  LocationEligibility,
  RemoteStatus,
  Seniority,
} from "../types";

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

export function formatCompensation(comp: Compensation): string {
  const original = comp.original_text?.trim();
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
  const postedDateIso = job.published_at || job.first_seen_at;
  const postedDateFormatted = formatDate(postedDateIso);
  const lastSeenFormatted = formatDate(job.last_seen_at);

  return (
    <article className="job-card" aria-labelledby={`job-title-${job.id}`}>
      <header className="job-card-header">
        <div className="job-card-main-info">
          <h2 id={`job-title-${job.id}`} className="job-title">
            <Link href={`/jobs/${job.id}`} className="job-title-link">
              {job.title}
            </Link>
          </h2>
          <p className="job-company">
            <span className="company-name">{job.company}</span>
            <span className="location-sep" aria-hidden="true">
              {" "}
              •{" "}
            </span>
            <span className="location-text">{locationText}</span>
          </p>
        </div>

        <div className="job-card-badges">
          <span className="badge badge-remote">
            {formatRemoteStatus(job.remote_status)}
          </span>
          <span className="badge badge-seniority">
            {formatSeniority(job.seniority)}
          </span>
          <span className="badge badge-eligibility">{eligibilityText}</span>
        </div>
      </header>

      <div className="job-card-body">
        <p
          className={`job-compensation ${
            compensationText === "Compensation not provided"
              ? "job-compensation-unknown"
              : "job-compensation-provided"
          }`}
        >
          <span className="comp-label sr-only">Compensation: </span>
          {compensationText}
        </p>

        {job.description_excerpt && (
          <p className="job-excerpt">{job.description_excerpt}</p>
        )}

        {job.technologies && job.technologies.length > 0 && (
          <div className="job-technologies" aria-label="Required technologies">
            {job.technologies.map((t) => (
              <span key={t.term} className="badge badge-tech">
                {t.term}
              </span>
            ))}
          </div>
        )}
      </div>

      <footer className="job-card-footer">
        <div className="job-dates">
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

        <div className="job-provenance-and-apply">
          <div className="job-sources" aria-label="Available on sources">
            <span className="sources-label">Sources:</span>
            {job.sources.map((s) => (
              <span key={s.source_id} className="badge badge-source">
                {s.source_name}
              </span>
            ))}
          </div>

          {job.primary_application_url && (
            <a
              href={job.primary_application_url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-apply"
            >
              Apply on {job.sources[0]?.source_name ?? "Source"}{" "}
              <span aria-hidden="true">↗</span>
              <span className="sr-only"> (opens in new tab)</span>
            </a>
          )}
        </div>
      </footer>
    </article>
  );
}
