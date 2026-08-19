"use client";

import Link from "next/link";
import { useEffect } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";

export default function JobsError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("JobsPage encountered an error:", error);
  }, [error]);

  return (
    <div className="jobs-error-container flex justify-center py-8">
      <Alert variant="destructive" className="max-w-lg p-6 text-center">
        <AlertTitle className="text-xl font-bold">
          <h2 className="m-0 text-xl font-bold">Unable to Load Jobs</h2>
        </AlertTitle>
        <AlertDescription className="text-destructive">
          <p className="mb-2 font-medium">
            {error.message ||
              "We were unable to connect to the Job Engine API service or complete your search request."}
          </p>
          <p className="mb-6 text-sm text-muted-foreground">
            Please check your network connection or verify that the API backend
            is running, then try again.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button type="button" onClick={() => reset()}>
              Retry search
            </Button>
            <Link href="/jobs" className={buttonVariants({ variant: "outline" })}>
              Reset to default search
            </Link>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
