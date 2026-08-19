import Link from "next/link";
import { buildSearchUrl } from "../search-params";
import type { JobSearchParams } from "../types";

export function generatePageWindow(
  currentPage: number,
  totalPages: number,
): (number | "...")[] {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }

  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }

  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
}

export function Pagination({
  currentPage,
  totalPages,
  params,
}: {
  currentPage: number;
  totalPages: number;
  params: JobSearchParams;
}) {
  if (totalPages <= 1) {
    return null;
  }

  const pages = generatePageWindow(currentPage, totalPages);
  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  return (
    <nav className="mt-8 flex justify-center" aria-label="Pagination Navigation">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {hasPrevious ? (
          <Link
            href={buildSearchUrl({ ...params, page: currentPage - 1 })}
            className="pagination-btn pagination-prev inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
            aria-label="Go to previous page"
          >
            ← Previous
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="pagination-btn pagination-disabled inline-flex h-9 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground opacity-50"
          >
            ← Previous
          </span>
        )}

        <div className="flex items-center gap-1">
          {pages.map((p, idx) => {
            if (p === "...") {
              return (
                <span
                  key={`ellipsis-${idx}`}
                  className="pagination-ellipsis px-1 text-muted-foreground"
                  aria-hidden="true"
                >
                  …
                </span>
              );
            }

            const isCurrent = p === currentPage;
            if (isCurrent) {
              return (
                <span
                  key={p}
                  aria-current="page"
                  className="pagination-number pagination-current inline-flex size-9 items-center justify-center rounded-lg bg-primary text-sm font-semibold text-primary-foreground"
                >
                  {p}
                </span>
              );
            }

            return (
              <Link
                key={p}
                href={buildSearchUrl({ ...params, page: p })}
                className="pagination-number inline-flex size-9 items-center justify-center rounded-lg border border-border bg-card text-sm font-medium hover:bg-muted"
                aria-label={`Go to page ${p}`}
              >
                {p}
              </Link>
            );
          })}
        </div>

        {hasNext ? (
          <Link
            href={buildSearchUrl({ ...params, page: currentPage + 1 })}
            className="pagination-btn pagination-next inline-flex h-9 items-center rounded-lg border border-border bg-card px-3 text-sm font-medium hover:bg-muted"
            aria-label="Go to next page"
          >
            Next →
          </Link>
        ) : (
          <span
            aria-disabled="true"
            className="pagination-btn pagination-disabled inline-flex h-9 items-center rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground opacity-50"
          >
            Next →
          </span>
        )}
      </div>
    </nav>
  );
}
