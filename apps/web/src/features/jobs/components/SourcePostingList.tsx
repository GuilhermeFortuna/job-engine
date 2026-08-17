import type { EmploymentType, JobStatus, SourcePostingDetail } from "../types";
import {
  formatCompensation,
  formatDate,
  formatRemoteStatus,
  formatSeniority,
} from "./JobCard";
import { ExternalApplyLink } from "./ExternalApplyLink";

export function formatEmploymentType(emp: EmploymentType): string {
  switch (emp) {
    case "full_time":
      return "Full-time";
    case "part_time":
      return "Part-time";
    case "contract":
      return "Contract";
    case "temporary":
      return "Temporary";
    case "internship":
      return "Internship";
    default:
      return "Employment: Unknown";
  }
}

export function formatJobStatus(status: JobStatus): string {
  switch (status) {
    case "active":
      return "Active";
    case "stale":
      return "Stale";
    case "closed":
      return "Closed";
    default:
      return "Unknown";
  }
}

export function SourcePostingList({
  postings,
}: {
  postings: SourcePostingDetail[];
}) {
  if (!postings || postings.length === 0) {
    return (
      <section
        className="source-postings-section"
        aria-labelledby="source-postings-heading"
      >
        <h2 id="source-postings-heading" className="section-heading">
          Source Provenance
        </h2>
        <p className="no-postings-message">No source postings linked to this record.</p>
      </section>
    );
  }

  return (
    <section
      className="source-postings-section"
      aria-labelledby="source-postings-heading"
    >
      <header className="source-postings-header">
        <h2 id="source-postings-heading" className="section-heading">
          Source Provenance & Postings ({postings.length})
        </h2>
        <p className="section-subheading">
          Every original posting linked to this aggregated canonical role, preserving original values, source IDs, and ingestion audit metadata.
        </p>
      </header>

      <div className="source-postings-list">
        {postings.map((posting) => {
          const compFormatted = formatCompensation(posting.compensation);
          const publishedIso = posting.published_at || posting.first_seen_at;

          return (
            <article
              key={posting.id}
              className="source-posting-card"
              aria-labelledby={`source-posting-${posting.id}`}
            >
              <header className="source-posting-header">
                <div className="source-posting-meta">
                  <span className="badge badge-source">{posting.source_name}</span>
                  <span className={`badge badge-status status-${posting.status}`}>
                    {formatJobStatus(posting.status)}
                  </span>
                  <span className="source-posting-id">
                    ID: <code>{posting.source_posting_id}</code>
                  </span>
                </div>
                <div className="source-posting-actions">
                  <ExternalApplyLink
                    url={posting.application_url}
                    sourceName={posting.source_name}
                    className="btn btn-primary btn-apply"
                  />
                </div>
              </header>

              <dl className="source-posting-details-grid">
                <div className="source-detail-row">
                  <dt className="source-detail-term">Original Title</dt>
                  <dd className="source-detail-desc">{posting.title_original || "Not specified"}</dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Original Company</dt>
                  <dd className="source-detail-desc">{posting.company_original || "Not specified"}</dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Original Location</dt>
                  <dd className="source-detail-desc">{posting.location_original || "Not specified"}</dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Remote Status</dt>
                  <dd className="source-detail-desc">{formatRemoteStatus(posting.remote_status)}</dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Employment Type</dt>
                  <dd className="source-detail-desc">{formatEmploymentType(posting.employment_type)}</dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Seniority</dt>
                  <dd className="source-detail-desc">
                    {formatSeniority(posting.seniority)}
                    {posting.seniority_original && posting.seniority_original !== posting.seniority && (
                      <span className="original-evidence"> (as published: &ldquo;{posting.seniority_original}&rdquo;)</span>
                    )}
                  </dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Compensation</dt>
                  <dd className="source-detail-desc">{compFormatted}</dd>
                </div>

                {posting.technologies_original_text && (
                  <div className="source-detail-row">
                    <dt className="source-detail-term">Technologies (Raw Text)</dt>
                    <dd className="source-detail-desc">
                      <code>{posting.technologies_original_text}</code>
                    </dd>
                  </div>
                )}

                {posting.location_eligibility_evidence && (
                  <div className="source-detail-row">
                    <dt className="source-detail-term">Eligibility Evidence</dt>
                    <dd className="source-detail-desc">{posting.location_eligibility_evidence}</dd>
                  </div>
                )}

                <div className="source-detail-row">
                  <dt className="source-detail-term">Published Date</dt>
                  <dd className="source-detail-desc">
                    <time dateTime={publishedIso ?? undefined}>{formatDate(publishedIso)}</time>
                  </dd>
                </div>

                <div className="source-detail-row">
                  <dt className="source-detail-term">Ingestion Audit</dt>
                  <dd className="source-detail-desc audit-timestamps">
                    <span>First seen: {formatDate(posting.first_seen_at)}</span>
                    <span className="bullet-sep" aria-hidden="true"> • </span>
                    <span>Last seen: {formatDate(posting.last_seen_at)}</span>
                    <span className="bullet-sep" aria-hidden="true"> • </span>
                    <span>Linked: {formatDate(posting.linked_at)}</span>
                    {posting.adapter_version && (
                      <>
                        <span className="bullet-sep" aria-hidden="true"> • </span>
                        <span>Adapter: v{posting.adapter_version}</span>
                      </>
                    )}
                  </dd>
                </div>
              </dl>
            </article>
          );
        })}
      </div>
    </section>
  );
}
