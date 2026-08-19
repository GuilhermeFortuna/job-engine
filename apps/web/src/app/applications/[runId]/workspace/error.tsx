"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function ApplicationWorkspaceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Application workspace encountered an error:", error);
  }, [error]);

  return (
    <div role="alert" className="jobs-error-container">
      <div className="jobs-error-card">
        <h2 className="error-heading">Unable to Load Application Workspace</h2>
        <p className="error-message">
          {error.message ||
            "We were unable to open the assisted application workspace."}
        </p>
        <div className="error-actions">
          <button type="button" onClick={() => reset()} className="btn btn-primary btn-retry">
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
