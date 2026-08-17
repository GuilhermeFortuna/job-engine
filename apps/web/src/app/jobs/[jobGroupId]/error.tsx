"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function JobDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("JobDetailPage encountered an error:", error);
  }, [error]);

  return (
    <div role="alert" className="jobs-error-container">
      <div className="jobs-error-card">
        <h2 className="error-heading">Unable to Load Job Details</h2>
        <p className="error-message">
          {error.message ||
            "We were unable to connect to the Job Engine API service to retrieve details for this opportunity."}
        </p>
        <p className="error-guidance">
          Please check your network connection or verify that the API backend is available, then try again.
        </p>

        <div className="error-actions">
          <button
            type="button"
            onClick={() => reset()}
            className="btn btn-primary btn-retry"
          >
            Retry
          </button>
          <Link href="/jobs" className="btn btn-secondary">
            Back to search
          </Link>
        </div>
      </div>
    </div>
  );
}
