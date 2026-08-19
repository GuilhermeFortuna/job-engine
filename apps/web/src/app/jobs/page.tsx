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
import { JobSearchForm } from "@/features/jobs/components/JobSearchForm";
import { Pagination } from "@/features/jobs/components/Pagination";
import { SearchStatus } from "@/features/jobs/components/SearchStatus";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Search Jobs - Job Engine",
  description:
    "Unified search and aggregated results for software development roles from multiple sources.",
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
      <header className="jobs-page-header">
        <h1 className="jobs-page-heading">Software Engineering Jobs</h1>
        <p className="jobs-page-subheading">
          <AnimatedShinyText className="mx-0 max-w-none text-muted-foreground dark:text-muted-foreground">
            Aggregated and verified remote opportunities from multiple catalog
            sources.
          </AnimatedShinyText>
        </p>
      </header>

      <CatalogHealthNotice health={catalogHealth} />

      <div className="jobs-page-layout">
        <aside
          className="jobs-sidebar rounded-xl bg-card p-4 ring-1 ring-foreground/10"
          aria-label="Search and Filter Controls"
        >
          <JobSearchForm
            params={validatedParams}
            catalogFilters={catalogFilters}
          />
        </aside>

        <section className="jobs-main-content" aria-label="Job Search Results">
          <SearchStatus
            total={searchResponse.total}
            page={searchResponse.page}
            pageSize={searchResponse.page_size}
          />

          <ActiveFilters
            params={validatedParams}
            catalogFilters={catalogFilters}
          />

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
