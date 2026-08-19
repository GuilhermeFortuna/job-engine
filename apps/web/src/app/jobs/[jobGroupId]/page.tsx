import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ApiError, ApiNotFoundError, fetchJobDetail } from "@/features/jobs/api";
import { JobDetails } from "@/features/jobs/components/JobDetails";
import type { JobDetail } from "@/features/jobs/types";

interface JobPageProps {
  params: Promise<{ jobGroupId: string }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(props: JobPageProps): Promise<Metadata> {
  const { jobGroupId } = await props.params;
  try {
    const job = await fetchJobDetail(jobGroupId);
    return {
      title: `${job.title} at ${job.company} - Job Engine`,
      description: `View details, compensation, eligibility, and verified source postings for ${job.title} at ${job.company}.`,
    };
  } catch {
    return {
      title: "Job Details - Job Engine",
      description: "Aggregated software development job details and source provenance.",
    };
  }
}

export default async function JobPage(props: JobPageProps) {
  const { jobGroupId } = await props.params;
  let job: JobDetail;

  try {
    job = await fetchJobDetail(jobGroupId);
  } catch (err) {
    if (
      err instanceof ApiNotFoundError ||
      (err instanceof ApiError && err.status === 404)
    ) {
      notFound();
    }
    throw err;
  }

  return (
    <div className="job-details-page-container">
      <JobDetails job={job} />
    </div>
  );
}
