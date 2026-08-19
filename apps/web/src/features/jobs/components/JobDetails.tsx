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
import { ApplicationLauncher } from "@/features/applications/components/ApplicationLauncher";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
} from "@/components/ui/card";
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

  const statusVariant =
    job.status === "active"
      ? "success"
      : job.status === "stale"
        ? "warning"
        : job.status === "closed"
          ? "destructive"
          : "secondary";

  return (
    <article className="flex flex-col gap-6" aria-labelledby="job-details-title">
      <nav aria-label="Breadcrumb navigation">
        <Link href="/jobs" className={buttonVariants({ variant: "outline", size: "sm" })}>
          <span aria-hidden="true">← </span>Back to search
        </Link>
      </nav>

      <header className="flex flex-col gap-5 rounded-xl border border-border bg-card p-6 shadow-[var(--shadow-elevated)] md:flex-row md:items-start md:justify-between">
        <div className="min-w-0 flex-1">
          <h1 id="job-details-title" className="m-0 mb-2 text-3xl font-bold tracking-tight">
            {job.title}
          </h1>
          {job.title_original && job.title_original !== job.title && (
            <p className="mb-2 text-sm text-muted-foreground">
              Original title as posted: <em>&ldquo;{job.title_original}&rdquo;</em>
            </p>
          )}
          <p className="mb-4 text-lg text-muted-foreground">
            <span className="company-name font-semibold text-foreground">{job.company}</span>
            {job.company_original && job.company_original !== job.company && (
              <span className="text-sm"> (posted as: &ldquo;{job.company_original}&rdquo;)</span>
            )}
            <span aria-hidden="true"> • </span>
            <span>{locationText}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Badge variant="remote">{formatRemoteStatus(job.remote_status)}</Badge>
            <Badge variant="secondary">{formatSeniority(job.seniority)}</Badge>
            <Badge variant="family">{formatEmploymentType(job.employment_type)}</Badge>
            <Badge variant="eligibility">{eligibilityText}</Badge>
            <Badge variant={statusVariant}>Status: {formatJobStatus(job.status)}</Badge>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {job.primary_application_url ? (
            <>
              <ExternalApplyLink
                url={job.primary_application_url}
                sourceName={primarySource}
              >
                Apply on {primarySource}
              </ExternalApplyLink>
              <ApplicationLauncher
                jobGroupId={job.id}
                title={job.title}
                company={job.company}
                applicationUrl={job.primary_application_url}
                sourceName={primarySource}
              />
            </>
          ) : (
            <span
              className="inline-flex items-center rounded-lg border border-dashed border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
              aria-disabled="true"
            >
              Application link unavailable
            </span>
          )}
        </div>
      </header>

      <Card>
        <CardHeader className="border-b">
          <h2 id="key-details-heading" className="text-xl font-semibold">
            Key Details
          </h2>
        </CardHeader>
        <CardContent className="pt-4">
          <dl className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Compensation
              </dt>
              <dd
                className={
                  compensationText === "Compensation not provided"
                    ? "m-0 font-medium text-muted-foreground italic"
                    : "m-0 font-semibold text-emerald-700 dark:text-emerald-400"
                }
              >
                {compensationText}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Location & Remote
              </dt>
              <dd className="m-0 font-medium">
                {formatRemoteStatus(job.remote_status)} — {locationText}
              </dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Location Eligibility
              </dt>
              <dd className="m-0 font-medium">{eligibilityText}</dd>
            </div>

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Seniority & Type
              </dt>
              <dd className="m-0 font-medium">
                {formatSeniority(job.seniority)} ({formatEmploymentType(job.employment_type)})
                {job.seniority_original && job.seniority_original !== job.seniority && (
                  <span className="font-normal text-muted-foreground">
                    {" "}
                    — source: &ldquo;{job.seniority_original}&rdquo;
                  </span>
                )}
              </dd>
            </div>

            {job.role_families && job.role_families.length > 0 && (
              <div className="flex flex-col gap-1">
                <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Role Families
                </dt>
                <dd className="m-0 flex flex-wrap gap-1">
                  {job.role_families.map((family) => (
                    <Badge key={family} variant="family">
                      {roleFamilyLabel(family)}
                    </Badge>
                  ))}
                </dd>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <dt className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                Catalog Freshness
              </dt>
              <dd className="m-0 font-mono text-xs text-muted-foreground">
                <span>
                  Posted:{" "}
                  <time dateTime={publishedDateIso ?? undefined}>
                    {formatDate(publishedDateIso)}
                  </time>
                </span>
                <span aria-hidden="true"> • </span>
                <span>
                  First seen:{" "}
                  <time dateTime={job.first_seen_at}>{formatDate(job.first_seen_at)}</time>
                </span>
                <span aria-hidden="true"> • </span>
                <span>
                  Last seen:{" "}
                  <time dateTime={job.last_seen_at}>{formatDate(job.last_seen_at)}</time>
                </span>
                {job.closed_at && (
                  <>
                    <span aria-hidden="true"> • </span>
                    <span>
                      Closed: <time dateTime={job.closed_at}>{formatDate(job.closed_at)}</time>
                    </span>
                  </>
                )}
              </dd>
            </div>
          </dl>

          {job.technologies && job.technologies.length > 0 && (
            <div className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">Required & Mentioned Technologies</h3>
              <div className="flex flex-wrap gap-1" aria-label="Normalized technologies">
                {job.technologies.map((t) => (
                  <Badge
                    key={t.term}
                    variant="tech"
                    title={t.source_text ? `Source: ${t.source_text}` : undefined}
                  >
                    {t.term}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="border-b">
          <h2 id="job-description-heading" className="text-xl font-semibold">
            Job Description
          </h2>
        </CardHeader>
        <CardContent className="pt-4">
          {descriptionText ? (
            <div className="text-[0.9375rem] leading-7 whitespace-pre-line">
              {descriptionText}
            </div>
          ) : (
            <p className="m-0 text-muted-foreground italic">
              No full description was provided by the source catalog. Please visit the source site for complete job requirements and application instructions.
            </p>
          )}
        </CardContent>
      </Card>

      <SourcePostingList postings={job.source_postings} />
    </article>
  );
}
