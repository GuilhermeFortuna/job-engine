"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useLiveSync } from "../hooks/useLiveSync";
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
import { LiveSearchButton } from "./LiveSearchButton";
import { LiveSyncProgressModal } from "./LiveSyncProgressModal";

export function JobSearchForm({
  params,
  catalogFilters,
}: {
  params: JobSearchParams;
  catalogFilters: CatalogFilters;
}) {
  const router = useRouter();
  const liveSync = useLiveSync();
  const [keywordInput, setKeywordInput] = useState(params.q ?? "");
  const [prevQ, setPrevQ] = useState(params.q);
  if (params.q !== prevQ) {
    setPrevQ(params.q);
    setKeywordInput(params.q ?? "");
  }

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

  const handleKeywordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = keywordInput.trim();
    const next = updateSearchParams(
      params,
      {
        q: trimmed.length > 0 ? trimmed : undefined,
      },
      true,
    );
    router.push(buildSearchUrl(next));
  };

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

  return (
    <form
      role="search"
      aria-label="Job Search and Filters"
      className="job-search-form"
      onSubmit={handleKeywordSubmit}
    >
      {/* 1. Keywords */}
      <div className="form-group keyword-search-group">
        <label htmlFor="search-keywords" className="form-label font-bold">
          Keywords
        </label>
        <div className="keyword-input-wrapper">
          <input
            id="search-keywords"
            type="search"
            name="q"
            value={keywordInput}
            onChange={(e) => setKeywordInput(e.target.value)}
            placeholder="Title, company, tech, or keywords..."
            className="form-input keyword-input"
          />
          <button type="submit" className="btn btn-primary btn-search">
            Search
          </button>
          <LiveSearchButton
            onStartSync={liveSync.startSync}
            status={liveSync.state.status}
            cooldownSeconds={liveSync.state.cooldown_remaining_seconds}
          />
        </div>
      </div>

      <details className="filters-details-accordion" open>
        <summary className="filters-summary-btn">
          <span>Filter & Refine Results</span>
        </summary>

        <div className="filters-grid">
          {/* 2. Role family */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Role Family</legend>
            <div className="checkbox-options-list">
              {catalogFilters.role_families.map((rf) => (
                <label key={rf.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    name="role_family"
                    value={rf.id}
                    checked={params.role_family.includes(rf.id)}
                    onChange={() =>
                      toggleArrayItem(
                        params.role_family,
                        rf.id as RoleFamilyId,
                        "role_family",
                      )
                    }
                  />
                  <span>{rf.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 3. Technologies */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Technologies</legend>
            <div className="checkbox-options-list tech-options-scroll">
              {catalogFilters.technologies.map((tech) => (
                <label key={tech.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    name="technology"
                    value={tech.value}
                    checked={params.technology.includes(tech.value)}
                    onChange={() =>
                      toggleArrayItem(
                        params.technology,
                        tech.value,
                        "technology",
                      )
                    }
                  />
                  <span>{tech.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 4. Remote status */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Remote Arrangement</legend>
            <div className="checkbox-options-list">
              {catalogFilters.remote_status.map((rs) => (
                <label key={rs.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    name="remote_status"
                    value={rs.value}
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
                  <span>{rs.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 5. Location eligibility */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Location Eligibility</legend>
            <div className="checkbox-options-list">
              {catalogFilters.location_eligibility.map((le) => (
                <label key={le.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    name="location_eligibility"
                    value={le.value}
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
                  <span>{le.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 6. Seniority */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Seniority</legend>
            <div className="checkbox-options-list">
              {catalogFilters.seniority.map((sen) => (
                <label key={sen.value} className="checkbox-label">
                  <input
                    type="checkbox"
                    name="seniority"
                    value={sen.value}
                    checked={params.seniority.includes(sen.value as Seniority)}
                    onChange={() =>
                      toggleArrayItem(
                        params.seniority,
                        sen.value as Seniority,
                        "seniority",
                      )
                    }
                  />
                  <span>{sen.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 7. Compensation */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Compensation (USD/yr)</legend>
            <div className="comp-inputs-wrapper">
              <div className="min-comp-input-group">
                <label htmlFor="min-comp-input" className="sr-only">
                  Minimum Annual USD
                </label>
                <input
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
                  className="form-input min-comp-input"
                />
              </div>

              <label className="checkbox-label comp-include-unknown-label">
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
                />
                <span>Include jobs with unknown compensation</span>
              </label>
            </div>
          </fieldset>

          {/* 8. Source */}
          <fieldset className="form-fieldset">
            <legend className="form-legend">Job Source</legend>
            <div className="checkbox-options-list">
              {catalogFilters.sources.map((src) => (
                <label key={src.id} className="checkbox-label">
                  <input
                    type="checkbox"
                    name="source"
                    value={src.id}
                    checked={params.source.includes(src.id)}
                    onChange={() =>
                      toggleArrayItem(params.source, src.id, "source")
                    }
                  />
                  <span>{src.label}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* 9. Posted date */}
          <div className="form-group select-group">
            <label htmlFor="posted-within-select" className="form-label">
              Posted Within
            </label>
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
              className="form-select"
            >
              {catalogFilters.posted_within.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>

          {/* 10. Sort */}
          <div className="form-group select-group">
            <label htmlFor="sort-select" className="form-label">
              Sort Order
            </label>
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
              className="form-select"
            >
              {catalogFilters.sort.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </details>

      <LiveSyncProgressModal
        isOpen={liveSync.isOpen}
        state={liveSync.state}
        onClose={liveSync.closeModal}
        onCancel={liveSync.cancelSync}
        onRetry={liveSync.startSync}
        liveAnnouncement={liveSync.liveAnnouncement}
      />
    </form>
  );
}
