import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";

export default function JobNotFound() {
  return (
    <div className="flex justify-center py-8">
      <Empty className="max-w-lg border bg-card py-8">
        <EmptyHeader>
          <EmptyTitle>
            <h1 className="m-0 text-2xl font-bold">Job Opportunity Not Found</h1>
          </EmptyTitle>
          <EmptyDescription>
            The requested job posting ID was not found in the Job Engine catalog or may have been closed.
          </EmptyDescription>
          <p className="text-sm text-muted-foreground">
            Try searching our active catalog of software engineering opportunities.
          </p>
        </EmptyHeader>
        <EmptyContent>
          <Link href="/jobs" className={buttonVariants()}>
            Back to job search
          </Link>
        </EmptyContent>
      </Empty>
    </div>
  );
}
