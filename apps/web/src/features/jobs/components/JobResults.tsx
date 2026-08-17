import { JobCard } from "./JobCard";
import type { JobListItem } from "../types";

export function JobResults({ items }: { items: JobListItem[] }) {
  if (items.length === 0) {
    return (
      <section
        aria-label="Search results"
        className="jobs-results-section jobs-results-empty"
      >
        <div className="jobs-empty-state">
          <h2 className="empty-heading">No matching jobs found</h2>
          <p className="empty-description">
            Try adjusting your search keywords, clearing active filters, or
            checking back later as new positions are ingested.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="Search results" className="jobs-results-section">
      <ol className="jobs-list">
        {items.map((job) => (
          <li key={job.id} className="jobs-list-item">
            <JobCard job={job} />
          </li>
        ))}
      </ol>
    </section>
  );
}
