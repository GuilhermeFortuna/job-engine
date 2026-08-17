import Link from "next/link";

export default function JobNotFound() {
  return (
    <div className="job-not-found-container">
      <div className="job-not-found-card">
        <h1 className="not-found-heading">Job Opportunity Not Found</h1>
        <p className="not-found-message">
          The requested job posting ID was not found in the Job Engine catalog or may have been closed.
        </p>
        <p className="not-found-guidance">
          Try searching our active catalog of software engineering opportunities.
        </p>
        <div className="not-found-actions">
          <Link href="/jobs" className="btn btn-primary">
            Back to job search
          </Link>
        </div>
      </div>
    </div>
  );
}
