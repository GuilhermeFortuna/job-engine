import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
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
      <Card aria-labelledby="source-postings-heading">
        <CardHeader className="border-b">
          <h2 id="source-postings-heading" className="text-xl font-semibold">
            Source Provenance
          </h2>
        </CardHeader>
        <CardContent className="pt-4">
          <p className="m-0 text-muted-foreground italic">
            No source postings linked to this record.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card aria-labelledby="source-postings-heading">
      <CardHeader className="border-b">
        <h2 id="source-postings-heading" className="text-xl font-semibold">
          Source Provenance & Postings ({postings.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          Every original posting linked to this aggregated canonical role, preserving original values, source IDs, and ingestion audit metadata.
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-4 pt-4">
        {postings.map((posting) => {
          const compFormatted = formatCompensation(posting.compensation);
          const publishedIso = posting.published_at || posting.first_seen_at;
          const statusVariant =
            posting.status === "active"
              ? "success"
              : posting.status === "stale"
                ? "warning"
                : posting.status === "closed"
                  ? "destructive"
                  : "secondary";

          return (
            <article
              key={posting.id}
              className="rounded-lg border border-border bg-background p-4"
              aria-labelledby={`source-posting-${posting.id}`}
            >
              <header className="mb-3 flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="source">{posting.source_name}</Badge>
                  <Badge variant={statusVariant}>{formatJobStatus(posting.status)}</Badge>
                  <span className="font-mono text-xs text-muted-foreground">
                    ID: <code className="rounded border border-border bg-card px-1">{posting.source_posting_id}</code>
                  </span>
                </div>
                <div>
                  <ExternalApplyLink
                    url={posting.listing_url}
                    sourceName={posting.source_name}
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
      </CardContent>
    </Card>
  );
}
