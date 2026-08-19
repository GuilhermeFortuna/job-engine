import { SearchXIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";
import { JobCard } from "./JobCard";
import type { JobListItem } from "../types";

export function JobResults({ items }: { items: JobListItem[] }) {
  if (items.length === 0) {
    return (
      <section
        aria-label="Search results"
        className="jobs-results-section jobs-results-empty"
      >
        <Empty className="border border-dashed bg-card py-8">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <SearchXIcon />
            </EmptyMedia>
            <EmptyTitle className="text-xl">
              <h2 className="m-0 text-xl font-semibold">No matching jobs found</h2>
            </EmptyTitle>
            <EmptyDescription>
              Try adjusting your search keywords, clearing active filters, or
              checking back later as new positions are ingested.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      </section>
    );
  }

  return (
    <section aria-label="Search results" className="jobs-results-section">
      <ol className="m-0 flex list-none flex-col gap-4 p-0">
        {items.map((job) => (
          <li key={job.id}>
            <JobCard job={job} />
          </li>
        ))}
      </ol>
    </section>
  );
}
