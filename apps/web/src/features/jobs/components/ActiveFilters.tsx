"use client";

import { useRouter } from "next/navigation";
import { buildSearchUrl, updateSearchParams } from "../search-params";
import type {
  CatalogFilters,
  JobSearchParams,
  LocationEligibilityFilter,
  RemoteStatus,
  RoleFamilyId,
  Seniority,
} from "../types";

export interface ActiveFilterItem {
  id: string;
  label: string;
  onRemove: () => void;
}

export function ActiveFilters({
  params,
  catalogFilters,
}: {
  params: JobSearchParams;
  catalogFilters: CatalogFilters;
}) {
  const router = useRouter();

  const roleLabels = new Map(catalogFilters.role_families.map((r) => [r.id, r.label]));
  const techLabels = new Map(catalogFilters.technologies.map((t) => [t.value, t.label]));
  const remoteLabels = new Map(catalogFilters.remote_status.map((r) => [r.value, r.label]));
  const locLabels = new Map(
    catalogFilters.location_eligibility.map((l) => [l.value, l.label]),
  );
  const seniorityLabels = new Map(
    catalogFilters.seniority.map((s) => [s.value, s.label]),
  );
  const postedLabels = new Map(
    catalogFilters.posted_within.map((p) => [p.value, p.label]),
  );
  const sortLabels = new Map(catalogFilters.sort.map((s) => [s.value, s.label]));
  const sourceLabels = new Map(catalogFilters.sources.map((s) => [s.id, s.label]));

  const activeItems: ActiveFilterItem[] = [];

  if (params.q) {
    activeItems.push({
      id: `q-${params.q}`,
      label: `Keyword: "${params.q}"`,
      onRemove: () => {
        const next = updateSearchParams(params, { q: undefined }, true);
        router.push(buildSearchUrl(next));
      },
    });
  }

  for (const rf of params.role_family) {
    activeItems.push({
      id: `role-${rf}`,
      label: `Role: ${roleLabels.get(rf) ?? rf}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          {
            role_family: params.role_family.filter((item) => item !== rf) as RoleFamilyId[],
          },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  for (const tech of params.technology) {
    activeItems.push({
      id: `tech-${tech}`,
      label: `Tech: ${techLabels.get(tech) ?? tech}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          {
            technology: params.technology.filter((item) => item !== tech),
          },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  for (const rs of params.remote_status) {
    activeItems.push({
      id: `remote-${rs}`,
      label: `Remote: ${remoteLabels.get(rs) ?? rs}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          {
            remote_status: params.remote_status.filter((item) => item !== rs) as RemoteStatus[],
          },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  for (const le of params.location_eligibility) {
    activeItems.push({
      id: `loc-${le}`,
      label: `Location: ${locLabels.get(le) ?? le}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          {
            location_eligibility: params.location_eligibility.filter(
              (item) => item !== le,
            ) as LocationEligibilityFilter[],
          },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  for (const sen of params.seniority) {
    activeItems.push({
      id: `sen-${sen}`,
      label: `Seniority: ${seniorityLabels.get(sen) ?? sen}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          {
            seniority: params.seniority.filter((item) => item !== sen) as Seniority[],
          },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  if (params.minimum_annual_usd !== undefined) {
    activeItems.push({
      id: `min-comp-${params.minimum_annual_usd}`,
      label: `Min Comp: $${params.minimum_annual_usd.toLocaleString()}/yr`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          { minimum_annual_usd: undefined },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  if (params.include_unknown_compensation === false) {
    activeItems.push({
      id: "unknown-comp-false",
      label: "Exclude Unknown Comp",
      onRemove: () => {
        const next = updateSearchParams(
          params,
          { include_unknown_compensation: true },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  for (const src of params.source) {
    activeItems.push({
      id: `source-${src}`,
      label: `Source: ${sourceLabels.get(src) ?? src}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          {
            source: params.source.filter((item) => item !== src),
          },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  if (params.posted_within && params.posted_within !== "any") {
    activeItems.push({
      id: `posted-${params.posted_within}`,
      label: `Posted: ${postedLabels.get(params.posted_within) ?? params.posted_within}`,
      onRemove: () => {
        const next = updateSearchParams(
          params,
          { posted_within: "any" },
          true,
        );
        router.push(buildSearchUrl(next));
      },
    });
  }

  if (params.sort && params.sort !== "newest") {
    activeItems.push({
      id: `sort-${params.sort}`,
      label: `Sort: ${sortLabels.get(params.sort) ?? params.sort}`,
      onRemove: () => {
        const next = updateSearchParams(params, { sort: "newest" }, true);
        router.push(buildSearchUrl(next));
      },
    });
  }

  if (activeItems.length === 0) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-border bg-card p-3"
      aria-label="Active filters"
    >
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Active filters:
        </span>
        <button
          type="button"
          onClick={() => router.push("/jobs")}
          className="text-xs font-semibold text-muted-foreground underline hover:text-foreground"
        >
          Clear all
        </button>
      </div>

      <ul className="m-0 flex list-none flex-wrap gap-2 p-0">
        {activeItems.map((item) => (
          <li
            key={item.id}
            className="inline-flex items-center gap-1 rounded-full border border-border bg-secondary px-2 py-0.5 text-[0.8125rem] text-secondary-foreground"
          >
            <span>{item.label}</span>
            <button
              type="button"
              onClick={item.onRemove}
              className="px-0.5 text-base leading-none text-muted-foreground hover:text-foreground"
              aria-label={`Remove filter ${item.label}`}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
