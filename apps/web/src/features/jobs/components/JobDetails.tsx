import Link from "next/link";
import type { JobDetail } from "../types";
import {
  formatCompensation,
  formatDate,
  formatLocationEligibility,
  formatRemoteStatus,
  formatSeniority,
  htmlToPlainText,
} from "./JobCard";
import { ExternalApplyLink } from "./ExternalApplyLink";
import { formatEmploymentType, formatJobStatus, SourcePostingList } from "./SourcePostingList";

export function roleFamilyLabel(familyId: string): string {
  switch (familyId) {
    case "software_developer":
      return "Software Developer";
    case "full_stack":
      return "Full Stack";
    case "backend":
      return "Backend";
    case "python":
      return "Python";
    case "frontend":
      return "Frontend";
    case "ai_application":
      return "AI Application";
    case "applied_ai":
      return "Applied AI";
    default:
      return familyId;
  }
}

export function JobDetails({ job }: { job: JobDetail }) {
  const locationText =
    job.location_original?.trim() ||
    [job.location_normalized_region, job.location_normalized_country]
      .filter(Boolean)
      .join(", ") ||
    "Location not specified";

  const compensationText = formatCompensation(job.compensation);
  const eligibilityText = formatLocationEligibility(job.location_eligibility);
  const descriptionText = htmlToPlainText(job.description);
  const publishedDateIso = job.published_at || job.first_seen_at;
  const primarySource = job.sources[0]?.source_name ?? "Source";

  return (
    <article className="job-details-view" aria-labelledby="job-details-title">
      <nav className="job-details-nav" aria-label="Breadcrumb navigation">
        <Link href="/jobs" className="btn btn-secondary btn-back">
          <span aria-hidden="true">← </span>Back to search
        </Link>
      </nav>

      <header className="job-details-header">
        <div className="job-details-header-main">
          <div className="job-details-titles">
            <h1 id="job-details-title" className="job-details-heading">
              {job.title}
            </h1>
            {job.title_original && job.title_original !== job.title && (
              <p className="job-original-title">
                Original title as posted: <em>&ldquo;{job.title_original}&rdquo;</em>
              </p>
            )}
            <p className="job-details-company">
              <span className="company-name">{job.company}</span>
              {job.company_original && job.company_original !== job.company && (
                <span className="company-original"> (posted as: &ldquo;{job.company_original}&rdquo;)</span>
              )}
              <span className="location-sep" aria-hidden="true"> • </span>
              <span className="location-text">{locationText}</span>
            </p>
          </div>

          <div className="job-details-header-badges">
            <span className="badge badge-remote">
              {formatRemoteStatus(job.remote_status)}
            </span>
            <span className="badge badge-seniority">
              {formatSeniority(job.seniority)}
            </span>
            <span className="badge badge-employment">
              {formatEmploymentType(job.employment_type)}
            </span>
            <span className="badge badge-eligibility">{eligibilityText}</span>
            <span className={`badge badge-status status-${job.status}`}>
              Status: {formatJobStatus(job.status)}
            </span>
          </div>
        </div>

        <div className="job-details-actions">
          {job.primary_application_url ? (
            <ExternalApplyLink
              url={job.primary_application_url}
              sourceName={primarySource}
              className="btn btn-primary btn-apply btn-apply-lg"
            >
              Apply on {primarySource}
            </ExternalApplyLink>
          ) : (
            <span className="apply-link-unavailable" aria-disabled="true">
              Application link unavailable
            </span>
          )}
        </div>
      </header>

      <section className="job-details-summary-section" aria-labelledby="key-details-heading">
        <h2 id="key-details-heading" className="section-heading">
          Key Details
        </h2>

        <dl className="job-details-meta-grid">
          <div className="meta-grid-item">
            <dt className="meta-term">Compensation</dt>
            <dd
              className={`meta-desc ${
                compensationText === "Compensation not provided"
                  ? "compensation-unknown"
                  : "compensation-provided"
              }`}
            >
              {compensationText}
            </dd>
          </div>

          <div className="meta-grid-item">
            <dt className="meta-term">Location & Remote</dt>
            <dd className="meta-desc">
              {formatRemoteStatus(job.remote_status)} — {locationText}
            </dd>
          </div>

          <div className="meta-grid-item">
            <dt className="meta-term">Location Eligibility</dt>
            <dd className="meta-desc">{eligibilityText}</dd>
          </div>

          <div className="meta-grid-item">
            <dt className="meta-term">Seniority & Type</dt>
            <dd className="meta-desc">
              {formatSeniority(job.seniority)} ({formatEmploymentType(job.employment_type)})
              {job.seniority_original && job.seniority_original !== job.seniority && (
                <span className="meta-evidence"> — source: &ldquo;{job.seniority_original}&rdquo;</span>
              )}
            </dd>
          </div>

          {job.role_families && job.role_families.length > 0 && (
            <div className="meta-grid-item">
              <dt className="meta-term">Role Families</dt>
              <dd className="meta-desc role-families-list">
                {job.role_families.map((family) => (
                  <span key={family} className="badge badge-family">
                    {roleFamilyLabel(family)}
                  </span>
                ))}
              </dd>
            </div>
          )}

          <div className="meta-grid-item">
            <dt className="meta-term">Catalog Freshness</dt>
            <dd className="meta-desc timestamps-desc">
              <span>
                Posted: <time dateTime={publishedDateIso ?? undefined}>{formatDate(publishedDateIso)}</time>
              </span>
              <span className="bullet-sep" aria-hidden="true"> • </span>
              <span>
                First seen: <time dateTime={job.first_seen_at}>{formatDate(job.first_seen_at)}</time>
              </span>
              <span className="bullet-sep" aria-hidden="true"> • </span>
              <span>
                Last seen: <time dateTime={job.last_seen_at}>{formatDate(job.last_seen_at)}</time>
              </span>
              {job.closed_at && (
                <>
                  <span className="bullet-sep" aria-hidden="true"> • </span>
                  <span>
                    Closed: <time dateTime={job.closed_at}>{formatDate(job.closed_at)}</time>
                  </span>
                </>
              )}
            </dd>
          </div>
        </dl>

        {job.technologies && job.technologies.length > 0 && (
          <div className="job-details-technologies">
            <h3 className="sub-heading">Required & Mentioned Technologies</h3>
            <div className="tech-badges-grid" aria-label="Normalized technologies">
              {job.technologies.map((t) => (
                <span key={t.term} className="badge badge-tech" title={t.source_text ? `Source: ${t.source_text}` : undefined}>
                  {t.term}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="job-details-description-section" aria-labelledby="job-description-heading">
        <h2 id="job-description-heading" className="section-heading">
          Job Description
        </h2>

        {descriptionText ? (
          <div className="job-description-text">
            {descriptionText}
          </div>
        ) : (
          <p className="no-description-message">
            No full description was provided by the source catalog. Please visit the source site for complete job requirements and application instructions.
          </p>
        )}
      </section>

      <SourcePostingList postings={job.source_postings} />
    </article>
  );
}
