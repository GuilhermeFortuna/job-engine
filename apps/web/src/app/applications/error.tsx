"use client";

import Link from "next/link";

export default function ApplicationsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="applications-route-error" role="alert">
      <h1>Unable to load applications</h1>
      <p>
        Application data could not be displayed safely. Retry or return to jobs.
      </p>
      <div className="error-actions">
        <button className="btn btn-primary" onClick={reset} type="button">
          Retry applications
        </button>
        <Link className="btn btn-secondary" href="/jobs">
          Browse jobs
        </Link>
      </div>
    </div>
  );
}
