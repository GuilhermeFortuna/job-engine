"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Error logged for diagnosis
    console.error("JobsPage encountered an error:", error);
  }, [error]);

  return (
    <div role="alert" className="jobs-error-container">
      <div className="jobs-error-card">
        <h2 className="error-heading">Unable to Load Jobs</h2>
        <p className="error-message">
          {error.message ||
            "We were unable to connect to the Job Engine API service or complete your search request."}
        </p>
        <p className="error-guidance">
          Please check your network connection or verify that the API backend
          is running, then try again.
        </p>

        <div className="error-actions">
          <button
            type="button"
            onClick={() => reset()}
            className="btn btn-primary btn-retry"
          >
            Retry search
          </button>
          <Link href="/jobs" className="btn btn-secondary">
            Reset to default search
          </Link>
        </div>
      </div>
    </div>
  );
}
