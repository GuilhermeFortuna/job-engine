"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { buildSearchUrl, updateSearchParams } from "../search-params";
import type {
  CatalogFilters,
  JobSearchParams,
  LocationEligibilityFilter,
  PostedWithin,
  RemoteStatus,
  RoleFamilyId,
  Seniority,
  SortValue,
} from "../types";

function FilterCheckbox({
  name,
  value,
  checked,
  label,
  onChange,
}: {
  name: string;
  value: string;
  checked: boolean;
  label: string;
  onChange: () => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
      <input
        type="checkbox"
        name={name}
        value={value}
        checked={checked}
        onChange={onChange}
        className="size-4 accent-primary"
      />
      <span>{label}</span>
    </label>
  );
}

export function JobSearchForm({
  params,
  catalogFilters,
}: {
  params: JobSearchParams;
  catalogFilters: CatalogFilters;
}) {
  const router = useRouter();
  const [minCompInput, setMinCompInput] = useState(
    params.minimum_annual_usd !== undefined
      ? String(params.minimum_annual_usd)
      : "",
  );
  const [prevMinComp, setPrevMinComp] = useState(params.minimum_annual_usd);
  if (params.minimum_annual_usd !== prevMinComp) {
    setPrevMinComp(params.minimum_annual_usd);
    setMinCompInput(
      params.minimum_annual_usd !== undefined
        ? String(params.minimum_annual_usd)
        : "",
    );
  }

  const handleMinCompSubmit = () => {
    const trimmed = minCompInput.trim();
    let num: number | undefined;
    if (trimmed.length > 0) {
      const parsed = Number(trimmed);
      if (!Number.isNaN(parsed) && parsed >= 0) {
        num = parsed;
      }
    }
    const next = updateSearchParams(
      params,
      {
        minimum_annual_usd: num,
      },
      true,
    );
    router.push(buildSearchUrl(next));
  };

  const toggleArrayItem = <T extends string>(
    currentList: T[],
    item: T,
    paramKey: keyof JobSearchParams,
  ) => {
    const nextList = currentList.includes(item)
      ? currentList.filter((x) => x !== item)
      : [...currentList, item];

    const next = updateSearchParams(
      params,
      {
        [paramKey]: nextList,
      },
      true,
    );
    router.push(buildSearchUrl(next));
  };

  const selectClassName =
    "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30";

  return (
    <form
      aria-label="Job filters"
      className="flex flex-col gap-4"
      onSubmit={(e) => e.preventDefault()}
    >
      <Accordion defaultValue={["filters"]} keepMounted>
        <AccordionItem value="filters" className="border-border">
          <AccordionTrigger className="px-0 text-sm font-semibold hover:no-underline">
            Filter & Refine Results
          </AccordionTrigger>
          <AccordionContent>
            <div className="flex flex-col gap-4 border-t border-border pt-3">
              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Role Family
                </FieldLegend>
                <div className="flex flex-col gap-2">
                  {catalogFilters.role_families.map((rf) => (
                    <FilterCheckbox
                      key={rf.id}
                      name="role_family"
                      value={rf.id}
                      label={rf.label}
                      checked={params.role_family.includes(rf.id)}
                      onChange={() =>
                        toggleArrayItem(
                          params.role_family,
                          rf.id as RoleFamilyId,
                          "role_family",
                        )
                      }
                    />
                  ))}
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Technologies
                </FieldLegend>
                <ScrollArea className="h-48 pr-2">
                  <div className="flex flex-col gap-2">
                    {catalogFilters.technologies.map((tech) => (
                      <FilterCheckbox
                        key={tech.value}
                        name="technology"
                        value={tech.value}
                        label={tech.label}
                        checked={params.technology.includes(tech.value)}
                        onChange={() =>
                          toggleArrayItem(
                            params.technology,
                            tech.value,
                            "technology",
                          )
                        }
                      />
                    ))}
                  </div>
                </ScrollArea>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Remote Arrangement
                </FieldLegend>
                <div className="flex flex-col gap-2">
                  {catalogFilters.remote_status.map((rs) => (
                    <FilterCheckbox
                      key={rs.value}
                      name="remote_status"
                      value={rs.value}
                      label={rs.label}
                      checked={params.remote_status.includes(
                        rs.value as RemoteStatus,
                      )}
                      onChange={() =>
                        toggleArrayItem(
                          params.remote_status,
                          rs.value as RemoteStatus,
                          "remote_status",
                        )
                      }
                    />
                  ))}
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Location Eligibility
                </FieldLegend>
                <div className="flex flex-col gap-2">
                  {catalogFilters.location_eligibility.map((le) => (
                    <FilterCheckbox
                      key={le.value}
                      name="location_eligibility"
                      value={le.value}
                      label={le.label}
                      checked={params.location_eligibility.includes(
                        le.value as LocationEligibilityFilter,
                      )}
                      onChange={() =>
                        toggleArrayItem(
                          params.location_eligibility,
                          le.value as LocationEligibilityFilter,
                          "location_eligibility",
                        )
                      }
                    />
                  ))}
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Seniority
                </FieldLegend>
                <div className="flex flex-col gap-2">
                  {catalogFilters.seniority.map((sen) => (
                    <FilterCheckbox
                      key={sen.value}
                      name="seniority"
                      value={sen.value}
                      label={sen.label}
                      checked={params.seniority.includes(sen.value as Seniority)}
                      onChange={() =>
                        toggleArrayItem(
                          params.seniority,
                          sen.value as Seniority,
                          "seniority",
                        )
                      }
                    />
                  ))}
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Compensation (USD/yr)
                </FieldLegend>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="min-comp-input" className="sr-only">
                    Minimum Annual USD
                  </Label>
                  <Input
                    id="min-comp-input"
                    type="number"
                    name="minimum_annual_usd"
                    min="0"
                    step="1000"
                    placeholder="Min USD / year (e.g. 80000)"
                    value={minCompInput}
                    onChange={(e) => setMinCompInput(e.target.value)}
                    onBlur={handleMinCompSubmit}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleMinCompSubmit();
                      }
                    }}
                  />
                  <label className="flex cursor-pointer items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      name="include_unknown_compensation"
                      checked={params.include_unknown_compensation !== false}
                      onChange={(e) => {
                        const next = updateSearchParams(
                          params,
                          {
                            include_unknown_compensation: e.target.checked,
                          },
                          true,
                        );
                        router.push(buildSearchUrl(next));
                      }}
                      className="size-4 accent-primary"
                    />
                    <span>Include jobs with unknown compensation</span>
                  </label>
                </div>
              </FieldSet>

              <FieldSet>
                <FieldLegend variant="label" className="text-muted-foreground uppercase tracking-wide">
                  Job Source
                </FieldLegend>
                <div className="flex flex-col gap-2">
                  {catalogFilters.sources.map((src) => (
                    <FilterCheckbox
                      key={src.id}
                      name="source"
                      value={src.id}
                      label={src.label}
                      checked={params.source.includes(src.id)}
                      onChange={() =>
                        toggleArrayItem(params.source, src.id, "source")
                      }
                    />
                  ))}
                </div>
              </FieldSet>

              <div className="flex flex-col gap-2">
                <Label htmlFor="posted-within-select">Posted Within</Label>
                <select
                  id="posted-within-select"
                  name="posted_within"
                  value={params.posted_within}
                  onChange={(e) => {
                    const next = updateSearchParams(
                      params,
                      {
                        posted_within: e.target.value as PostedWithin,
                      },
                      true,
                    );
                    router.push(buildSearchUrl(next));
                  }}
                  className={selectClassName}
                >
                  {catalogFilters.posted_within.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <Label htmlFor="sort-select">Sort Order</Label>
                <select
                  id="sort-select"
                  name="sort"
                  value={params.sort}
                  onChange={(e) => {
                    const next = updateSearchParams(
                      params,
                      {
                        sort: e.target.value as SortValue,
                      },
                      true,
                    );
                    router.push(buildSearchUrl(next));
                  }}
                  className={selectClassName}
                >
                  {catalogFilters.sort.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </form>
  );
}
