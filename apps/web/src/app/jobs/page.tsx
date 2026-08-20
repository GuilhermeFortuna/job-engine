import type { Metadata } from "next";
import { AnimatedShinyText } from "@/components/ui/animated-shiny-text";
import {
  fetchCatalogFilters,
  fetchCatalogHealth,
  searchJobs,
} from "@/features/jobs/api";
import {
  parseRawSearchParams,
  validateSearchParams,
} from "@/features/jobs/search-params";
import { ActiveFilters } from "@/features/jobs/components/ActiveFilters";
import { CatalogHealthNotice } from "@/features/jobs/components/CatalogHealthNotice";
import { JobResults } from "@/features/jobs/components/JobResults";
import { JobKeywordSearch } from "@/features/jobs/components/JobKeywordSearch";
import { JobSearchForm } from "@/features/jobs/components/JobSearchForm";
import { Pagination } from "@/features/jobs/components/Pagination";
import { SearchStatus } from "@/features/jobs/components/SearchStatus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search Jobs - Job Engine",
  description:
    "Search aggregated job listings from multiple catalog sources.",
};

interface JobsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage(props: JobsPageProps) {
  const rawParams = await props.searchParams;
  const [catalogFilters, catalogHealth] = await Promise.all([
    fetchCatalogFilters(),
    fetchCatalogHealth().catch(() => null),
  ]);
  const parsedParams = parseRawSearchParams(rawParams);
  const validatedParams = validateSearchParams(parsedParams, catalogFilters);
  const searchResponse = await searchJobs(validatedParams);

  return (
    <div className="jobs-page">
      <CatalogHealthNotice health={catalogHealth} />

      <div className="jobs-page-layout">
        <div className="jobs-search-column">
          <header className="jobs-page-header">
            <h1 className="jobs-page-heading">Looking for a new job?</h1>
            <p className="jobs-page-subheading">
              <AnimatedShinyText className="mx-auto max-w-none text-muted-foreground dark:text-muted-foreground">
                Search openings from multiple catalogs in one place.
              </AnimatedShinyText>
            </p>
          </header>

          <div className="jobs-keyword-search rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-elevated)]">
            <JobKeywordSearch params={validatedParams} />
          </div>

          <SearchStatus
            total={searchResponse.total}
            page={searchResponse.page}
            pageSize={searchResponse.page_size}
          />

          <ActiveFilters
            params={validatedParams}
            catalogFilters={catalogFilters}
          />
        </div>

        <aside
          className="jobs-sidebar rounded-xl border border-border bg-card p-4 shadow-[var(--shadow-elevated)]"
          aria-label="Filter Controls"
        >
          <JobSearchForm
            params={validatedParams}
            catalogFilters={catalogFilters}
          />
        </aside>

        <section className="jobs-main-content" aria-label="Job Search Results">
          <JobResults items={searchResponse.items} />

          <Pagination
            currentPage={searchResponse.page}
            totalPages={searchResponse.total_pages}
            params={validatedParams}
          />
        </section>
      </div>
    </div>
  );
}
