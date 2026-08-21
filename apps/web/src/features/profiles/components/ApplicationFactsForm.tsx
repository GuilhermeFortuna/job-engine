"use client";

import { useId } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { TextField, providedField } from "./FieldEditors";
import type { ApplicantProfile } from "../types";

export interface ApplicationFactsDraft {
  notice_period_days: string;
  authorized: boolean;
  requires_sponsorship: boolean;
  jurisdiction: string;
  currency: string;
  minimum_annual: string;
  target_annual: string;
  current_city: string;
  current_region: string;
  current_country: string;
  remote_preference: string;
  will_relocate: boolean;
  travel_percentage: string;
  decline_all_optional: boolean;
  gender: string;
  race_ethnicity: string;
  veteran_status: string;
  disability_status: string;
}

export function factsFromProfile(profile: ApplicantProfile): ApplicationFactsDraft {
  const auth = firstAuthorization(profile.work_authorizations.value);
  const compensation = asRecord(profile.compensation_expectation.value);
  const location = asRecord(profile.location_preferences.value);
  const demographics = asRecord(profile.demographics.value);
  return {
    notice_period_days:
      profile.notice_period_days.value != null
        ? String(profile.notice_period_days.value)
        : "",
    authorized: Boolean(auth?.authorized ?? true),
    requires_sponsorship: Boolean(auth?.requires_sponsorship ?? false),
    jurisdiction: String(auth?.jurisdiction ?? ""),
    currency: String(compensation?.currency ?? "USD"),
    minimum_annual:
      compensation?.minimum_annual != null
        ? String(compensation.minimum_annual)
        : "",
    target_annual:
      compensation?.target_annual != null
        ? String(compensation.target_annual)
        : "",
    current_city: String(location?.current_city ?? profile.city.value ?? ""),
    current_region: String(location?.current_region ?? profile.region.value ?? ""),
    current_country: String(
      location?.current_country ?? profile.country.value ?? "",
    ),
    remote_preference: String(location?.remote_preference ?? "remote_only"),
    will_relocate: Boolean(location?.will_relocate ?? false),
    travel_percentage: String(location?.travel_percentage ?? 0),
    decline_all_optional: demographics?.decline_all_optional !== false,
    gender: String(demographics?.gender ?? ""),
    race_ethnicity: String(demographics?.race_ethnicity ?? ""),
    veteran_status: String(demographics?.veteran_status ?? ""),
    disability_status: String(demographics?.disability_status ?? ""),
  };
}

export function factsToFields(
  draft: ApplicationFactsDraft,
): Pick<
  ApplicantProfile,
  | "notice_period_days"
  | "work_authorizations"
  | "compensation_expectation"
  | "location_preferences"
  | "demographics"
> {
  const now = new Date().toISOString();
  return {
    notice_period_days: draft.notice_period_days
      ? providedField(Number(draft.notice_period_days))
      : {
          state: "unknown",
          value: null,
          source: null,
          last_confirmed_at: null,
          policy_category: "verified_profile",
        },
    work_authorizations: providedField([
      {
        id: crypto.randomUUID(),
        jurisdiction: draft.jurisdiction || "unspecified",
        authorized: draft.authorized,
        requires_sponsorship: draft.requires_sponsorship,
        notes: null,
        provenance: "owner_authored",
        last_confirmed_at: now,
      },
    ]),
    compensation_expectation: providedField({
      currency: draft.currency || "USD",
      minimum_annual: draft.minimum_annual
        ? Number(draft.minimum_annual)
        : null,
      target_annual: draft.target_annual ? Number(draft.target_annual) : null,
      period: "annual",
      notes: null,
      last_confirmed_at: now,
    }),
    location_preferences: providedField({
      current_city: draft.current_city,
      current_region: draft.current_region,
      current_country: draft.current_country,
      timezone: null,
      remote_preference: draft.remote_preference || "remote_only",
      will_relocate: draft.will_relocate,
      travel_percentage: Number(draft.travel_percentage || 0),
    }),
    demographics: providedField({
      gender: draft.decline_all_optional ? null : draft.gender || null,
      race_ethnicity: draft.decline_all_optional
        ? null
        : draft.race_ethnicity || null,
      veteran_status: draft.decline_all_optional
        ? null
        : draft.veteran_status || null,
      disability_status: draft.decline_all_optional
        ? null
        : draft.disability_status || null,
      decline_all_optional: draft.decline_all_optional,
    }),
  };
}

interface ApplicationFactsFormProps {
  value: ApplicationFactsDraft;
  onChange: (value: ApplicationFactsDraft) => void;
}

export function ApplicationFactsForm({
  value,
  onChange,
}: ApplicationFactsFormProps) {
  const baseId = useId();

  function patch(partial: Partial<ApplicationFactsDraft>) {
    onChange({ ...value, ...partial });
  }

  return (
    <div className="application-facts-form">
      <p className="profile-section-guidance">
        These facts are entered by you. They are never filled in by AI suggestions.
      </p>

      <fieldset className="profile-fieldset">
        <legend>Work authorization</legend>
        <TextField
          id={`${baseId}-jurisdiction`}
          label="Country or jurisdiction"
          value={value.jurisdiction}
          onChange={(jurisdiction) => patch({ jurisdiction })}
        />
        <label className="profile-check">
          <Checkbox
            checked={value.authorized}
            onCheckedChange={(checked) =>
              patch({ authorized: Boolean(checked) })
            }
          />
          <span>I am authorized to work in this jurisdiction</span>
        </label>
        <label className="profile-check">
          <Checkbox
            checked={value.requires_sponsorship}
            onCheckedChange={(checked) =>
              patch({ requires_sponsorship: Boolean(checked) })
            }
          />
          <span>I will need employer sponsorship</span>
        </label>
        <TextField
          id={`${baseId}-notice`}
          label="Notice period (days)"
          type="number"
          value={value.notice_period_days}
          onChange={(notice_period_days) => patch({ notice_period_days })}
        />
      </fieldset>

      <fieldset className="profile-fieldset">
        <legend>Compensation expectations</legend>
        <p className="profile-field-hint">
          Optional. Shared only when an application asks and you authorize Auto Apply.
        </p>
        <TextField
          id={`${baseId}-currency`}
          label="Currency"
          value={value.currency}
          onChange={(currency) => patch({ currency })}
        />
        <TextField
          id={`${baseId}-min`}
          label="Minimum annual"
          type="number"
          value={value.minimum_annual}
          onChange={(minimum_annual) => patch({ minimum_annual })}
        />
        <TextField
          id={`${baseId}-target`}
          label="Target annual"
          type="number"
          value={value.target_annual}
          onChange={(target_annual) => patch({ target_annual })}
        />
      </fieldset>

      <fieldset className="profile-fieldset">
        <legend>Location preferences</legend>
        <TextField
          id={`${baseId}-city`}
          label="Current city"
          value={value.current_city}
          onChange={(current_city) => patch({ current_city })}
        />
        <TextField
          id={`${baseId}-region`}
          label="Region / state"
          value={value.current_region}
          onChange={(current_region) => patch({ current_region })}
        />
        <TextField
          id={`${baseId}-country`}
          label="Country"
          value={value.current_country}
          onChange={(current_country) => patch({ current_country })}
        />
        <div className="profile-field">
          <Label htmlFor={`${baseId}-remote`}>Remote preference</Label>
          <select
            id={`${baseId}-remote`}
            className="form-input"
            value={value.remote_preference}
            onChange={(event) =>
              patch({ remote_preference: event.target.value })
            }
          >
            <option value="remote_only">Remote only</option>
            <option value="hybrid">Hybrid</option>
            <option value="onsite">On-site</option>
            <option value="flexible">Flexible</option>
          </select>
        </div>
        <label className="profile-check">
          <Checkbox
            checked={value.will_relocate}
            onCheckedChange={(checked) =>
              patch({ will_relocate: Boolean(checked) })
            }
          />
          <span>Willing to relocate</span>
        </label>
        <TextField
          id={`${baseId}-travel`}
          label="Travel percentage"
          type="number"
          value={value.travel_percentage}
          onChange={(travel_percentage) => patch({ travel_percentage })}
        />
      </fieldset>

      <fieldset className="profile-fieldset">
        <legend>Optional demographic answers</legend>
        <p className="profile-field-hint">
          Demographic questions are optional. Declining keeps them blank for every
          application unless you change this later.
        </p>
        <label className="profile-check">
          <Checkbox
            checked={value.decline_all_optional}
            onCheckedChange={(checked) =>
              patch({ decline_all_optional: Boolean(checked) })
            }
          />
          <span>Decline all optional demographic questions by default</span>
        </label>
        {!value.decline_all_optional ? (
          <>
            <TextField
              id={`${baseId}-gender`}
              label="Gender"
              value={value.gender}
              onChange={(gender) => patch({ gender })}
            />
            <TextField
              id={`${baseId}-race`}
              label="Race / ethnicity"
              value={value.race_ethnicity}
              onChange={(race_ethnicity) => patch({ race_ethnicity })}
            />
            <TextField
              id={`${baseId}-veteran`}
              label="Veteran status"
              value={value.veteran_status}
              onChange={(veteran_status) => patch({ veteran_status })}
            />
            <TextField
              id={`${baseId}-disability`}
              label="Disability status"
              value={value.disability_status}
              onChange={(disability_status) => patch({ disability_status })}
            />
          </>
        ) : null}
      </fieldset>
    </div>
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

function firstAuthorization(
  value: unknown,
): Record<string, unknown> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const first = value[0];
  return first && typeof first === "object"
    ? (first as Record<string, unknown>)
    : null;
}
