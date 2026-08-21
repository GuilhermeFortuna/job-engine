"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ConfirmedField } from "../types";

export function emptyConfirmedField(): ConfirmedField {
  return {
    state: "unknown",
    value: null,
    source: null,
    last_confirmed_at: null,
    policy_category: "verified_profile",
  };
}

export function providedField(value: unknown): ConfirmedField {
  return {
    state: "provided",
    value,
    source: "owner",
    last_confirmed_at: new Date().toISOString(),
    policy_category: "verified_profile",
  };
}

interface TextFieldProps {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "tel" | "url" | "number";
  required?: boolean;
  hint?: string;
  multiline?: boolean;
}

export function TextField({
  id,
  label,
  value,
  onChange,
  type = "text",
  required = false,
  hint,
  multiline = false,
}: TextFieldProps) {
  return (
    <div className="profile-field">
      <Label htmlFor={id}>
        {label}
        {required ? " *" : ""}
      </Label>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          value={value}
          required={required}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint ? <p className="profile-field-hint">{hint}</p> : null}
    </div>
  );
}

interface StringListEditorProps {
  id: string;
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder?: string;
}

export function StringListEditor({
  id,
  label,
  values,
  onChange,
  placeholder = "Add an item",
}: StringListEditorProps) {
  return (
    <fieldset className="profile-repeatable">
      <legend>{label}</legend>
      <ul className="profile-repeatable-list">
        {values.map((value, index) => (
          <li key={`${id}-${index}`}>
            <Input
              aria-label={`${label} ${index + 1}`}
              value={value}
              onChange={(event) => {
                const next = [...values];
                next[index] = event.target.value;
                onChange(next);
              }}
            />
            <button
              type="button"
              className="profile-repeatable-remove"
              onClick={() => onChange(values.filter((_, i) => i !== index))}
            >
              Remove
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() => onChange([...values, ""])}
      >
        {placeholder}
      </button>
    </fieldset>
  );
}

export interface EmploymentDraft {
  company: string;
  title: string;
  start_date: string;
  end_date: string;
  description: string;
}

export function EmploymentEditor({
  items,
  onChange,
}: {
  items: EmploymentDraft[];
  onChange: (items: EmploymentDraft[]) => void;
}) {
  return (
    <fieldset className="profile-repeatable">
      <legend>Employment history</legend>
      {items.map((item, index) => (
        <div key={`emp-${index}`} className="profile-repeatable-card">
          <TextField
            id={`emp-company-${index}`}
            label="Company"
            value={item.company}
            onChange={(company) => {
              const next = [...items];
              next[index] = { ...item, company };
              onChange(next);
            }}
          />
          <TextField
            id={`emp-title-${index}`}
            label="Title"
            value={item.title}
            onChange={(title) => {
              const next = [...items];
              next[index] = { ...item, title };
              onChange(next);
            }}
          />
          <TextField
            id={`emp-start-${index}`}
            label="Start date"
            value={item.start_date}
            onChange={(start_date) => {
              const next = [...items];
              next[index] = { ...item, start_date };
              onChange(next);
            }}
          />
          <TextField
            id={`emp-end-${index}`}
            label="End date"
            value={item.end_date}
            onChange={(end_date) => {
              const next = [...items];
              next[index] = { ...item, end_date };
              onChange(next);
            }}
          />
          <TextField
            id={`emp-desc-${index}`}
            label="Description"
            value={item.description}
            multiline
            onChange={(description) => {
              const next = [...items];
              next[index] = { ...item, description };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="profile-repeatable-remove"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove role
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          onChange([
            ...items,
            {
              company: "",
              title: "",
              start_date: "",
              end_date: "",
              description: "",
            },
          ])
        }
      >
        Add role
      </button>
    </fieldset>
  );
}

export interface EducationDraft {
  institution: string;
  credential: string;
  field_of_study: string;
  start_date: string;
  end_date: string;
}

export function EducationEditor({
  items,
  onChange,
}: {
  items: EducationDraft[];
  onChange: (items: EducationDraft[]) => void;
}) {
  return (
    <fieldset className="profile-repeatable">
      <legend>Education</legend>
      {items.map((item, index) => (
        <div key={`edu-${index}`} className="profile-repeatable-card">
          <TextField
            id={`edu-inst-${index}`}
            label="Institution"
            value={item.institution}
            onChange={(institution) => {
              const next = [...items];
              next[index] = { ...item, institution };
              onChange(next);
            }}
          />
          <TextField
            id={`edu-cred-${index}`}
            label="Credential"
            value={item.credential}
            onChange={(credential) => {
              const next = [...items];
              next[index] = { ...item, credential };
              onChange(next);
            }}
          />
          <TextField
            id={`edu-field-${index}`}
            label="Field of study"
            value={item.field_of_study}
            onChange={(field_of_study) => {
              const next = [...items];
              next[index] = { ...item, field_of_study };
              onChange(next);
            }}
          />
          <button
            type="button"
            className="profile-repeatable-remove"
            onClick={() => onChange(items.filter((_, i) => i !== index))}
          >
            Remove
          </button>
        </div>
      ))}
      <button
        type="button"
        className="btn btn-secondary"
        onClick={() =>
          onChange([
            ...items,
            {
              institution: "",
              credential: "",
              field_of_study: "",
              start_date: "",
              end_date: "",
            },
          ])
        }
      >
        Add education
      </button>
    </fieldset>
  );
}
