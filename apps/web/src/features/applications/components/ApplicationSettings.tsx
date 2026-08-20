"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from "react";
import {
  ApiError,
  ApiNotFoundError,
  NetworkError,
  createAnswer,
  deleteAnswer,
  deleteResume,
  fetchAnswerBank,
  fetchApplicantProfile,
  fetchResumes,
  registerResume,
  updateAnswer,
  updateApplicantProfile,
  updateResume,
} from "../api";
import { APPLICATION_READINESS_REFRESH_EVENT } from "../events";
import {
  APPLICANT_PROFILE_FIELD_NAMES,
  type ApplicantProfile,
  type ApplicantProfileFieldName,
  type ApplicantProfileFields,
  type ConfirmedField,
  type PolicyCategory,
  type QuestionIntent,
  type ReusableAnswer,
  type ReusableAnswerInput,
  type SafeResume,
  type ValueState,
} from "../types";
import { ApplicationModal } from "./ApplicationModal";

const QUESTION_INTENTS: QuestionIntent[] = [
  "work_authorization",
  "sponsorship_required",
  "notice_period",
  "availability_date",
  "compensation_expectation",
  "location_preference",
  "relocation",
  "travel",
  "gender",
  "race_ethnicity",
  "veteran_status",
  "disability_status",
  "legal_attestation",
  "background_check_consent",
  "arbitration_consent",
  "privacy_consent",
  "export_control",
  "conflict_of_interest",
  "signature",
  "narrative",
];

const STRUCTURED_PROFILE_FIELDS = new Set<ApplicantProfileFieldName>([
  "custom_urls",
  "employment_history",
  "education_history",
  "skills",
  "languages",
  "certifications",
  "work_authorizations",
  "compensation_expectation",
  "location_preferences",
  "demographics",
]);

interface EditableField {
  field: ConfirmedField;
  text: string;
}

type ProfileDraft = Record<ApplicantProfileFieldName, EditableField>;

function emptyField(): ConfirmedField {
  return {
    state: "unknown",
    value: null,
    source: null,
    last_confirmed_at: null,
    policy_category: "review_required",
  };
}

function valueText(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }
  return typeof value === "string" ? value : JSON.stringify(value, null, 2);
}

function profileDraft(profile: ApplicantProfile | null): ProfileDraft {
  return Object.fromEntries(
    APPLICANT_PROFILE_FIELD_NAMES.map((name) => {
      const field = profile?.[name] ?? emptyField();
      return [name, { field, text: valueText(field.value) }];
    }),
  ) as ProfileDraft;
}

function labelFor(name: string): string {
  const label = name.replaceAll("_", " ");
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function safeError(error: unknown, action: string): string {
  if (error instanceof ApiError && error.status === 409) {
    return `${action} changed elsewhere. Refresh and review the latest version before trying again.`;
  }
  if (error instanceof NetworkError) {
    return `A network error prevented ${action.toLowerCase()}. Check the API connection and try again.`;
  }
  if (error instanceof ApiError) {
    return `The API could not complete ${action.toLowerCase()}. Review the fields and try again.`;
  }
  return `Unable to complete ${action.toLowerCase()}. Try again.`;
}

function announceReadinessRefresh(): void {
  window.dispatchEvent(new Event(APPLICATION_READINESS_REFRESH_EVENT));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function hasString(record: Record<string, unknown>, key: string): boolean {
  return typeof record[key] === "string" && record[key].length > 0;
}

function isStringArray(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isOptionalString(value: unknown): boolean {
  return value === undefined || value === null || typeof value === "string";
}

function validateStructuredValue(
  name: ApplicantProfileFieldName,
  value: unknown,
): string | null {
  const label = labelFor(name);
  if (name === "custom_urls") {
    return isRecord(value) &&
      Object.values(value).every((item) => typeof item === "string")
      ? null
      : `${label} must be an object whose values are strings.`;
  }
  if (name === "skills") {
    return isStringArray(value) ? null : `${label} must be an array of strings.`;
  }
  if (
    name === "employment_history" ||
    name === "education_history" ||
    name === "languages" ||
    name === "certifications" ||
    name === "work_authorizations"
  ) {
    if (!Array.isArray(value) || !value.every(isRecord)) {
      return `${label} must be an array of objects.`;
    }
    for (const entry of value) {
      if (typeof entry.id === "string" && !UUID_PATTERN.test(entry.id)) {
        return `${label} entry IDs must be valid UUIDs.`;
      }
      if (
        name === "employment_history" &&
        !(
          hasString(entry, "id") &&
          hasString(entry, "company") &&
          hasString(entry, "title") &&
          hasString(entry, "start_date") &&
          (entry.responsibilities === undefined ||
            isStringArray(entry.responsibilities)) &&
          (entry.technologies === undefined || isStringArray(entry.technologies))
        )
      ) {
        return `${label} entries require id, company, title, and start_date strings; responsibilities and technologies must be string arrays.`;
      }
      if (
        name === "employment_history" &&
        !(
          isOptionalString(entry.location) &&
          isOptionalString(entry.end_date) &&
          (entry.is_current === undefined ||
            typeof entry.is_current === "boolean")
        )
      ) {
        return `${label} optional location and end_date must be strings or null, and is_current must be boolean.`;
      }
      if (
        name === "education_history" &&
        !(
          hasString(entry, "id") &&
          hasString(entry, "institution") &&
          hasString(entry, "degree")
        )
      ) {
        return `${label} entries require id, institution, and degree strings.`;
      }
      if (
        name === "education_history" &&
        !(
          isOptionalString(entry.field_of_study) &&
          isOptionalString(entry.start_date) &&
          isOptionalString(entry.end_date) &&
          isOptionalString(entry.location)
        )
      ) {
        return `${label} optional fields must be strings or null.`;
      }
      if (
        name === "languages" &&
        !(hasString(entry, "id") && hasString(entry, "language") && hasString(entry, "proficiency"))
      ) {
        return `${label} entries require id, language, and proficiency strings.`;
      }
      if (
        name === "certifications" &&
        !(hasString(entry, "id") && hasString(entry, "name"))
      ) {
        return `${label} entries require id and name strings.`;
      }
      if (
        name === "certifications" &&
        ![
          "issuer",
          "issue_date",
          "expiry_date",
          "credential_id",
          "credential_url",
        ].every((key) => isOptionalString(entry[key]))
      ) {
        return `${label} optional fields must be strings or null.`;
      }
      if (
        name === "work_authorizations" &&
        !(
          hasString(entry, "id") &&
          hasString(entry, "jurisdiction") &&
          typeof entry.authorized === "boolean" &&
          typeof entry.requires_sponsorship === "boolean" &&
          hasString(entry, "last_confirmed_at")
        )
      ) {
        return `${label} entries require id, jurisdiction, authorization booleans, and last_confirmed_at.`;
      }
      if (
        name === "work_authorizations" &&
        !(isOptionalString(entry.notes) && isOptionalString(entry.provenance))
      ) {
        return `${label} optional notes and provenance must be strings or null.`;
      }
    }
    return null;
  }
  if (!isRecord(value)) {
    return `${label} must be a JSON object.`;
  }
  if (name === "compensation_expectation") {
    return hasString(value, "last_confirmed_at") &&
      (value.minimum_annual == null || typeof value.minimum_annual === "number") &&
      (value.target_annual == null || typeof value.target_annual === "number")
      ? null
      : `${label} requires last_confirmed_at and numeric annual amounts when provided.`;
  }
  if (name === "location_preferences") {
    return hasString(value, "current_city") &&
      hasString(value, "current_region") &&
      hasString(value, "current_country") &&
      (value.travel_percentage === undefined ||
        (typeof value.travel_percentage === "number" &&
          value.travel_percentage >= 0 &&
          value.travel_percentage <= 100))
      ? null
      : `${label} requires current_city, current_region, and current_country strings; travel_percentage must be a number from 0 to 100.`;
  }
  if (name === "demographics") {
    const optionalStrings = [
      "gender",
      "race_ethnicity",
      "veteran_status",
      "disability_status",
    ];
    return optionalStrings.every(
      (key) => value[key] == null || typeof value[key] === "string",
    ) &&
      (value.decline_all_optional === undefined ||
        typeof value.decline_all_optional === "boolean")
      ? null
      : `${label} fields must be strings or null and decline_all_optional must be boolean.`;
  }
  return null;
}

interface ConfirmDialogProps {
  label: string;
  children: ReactNode;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
  returnFocusRef: RefObject<HTMLElement | null>;
}

function ConfirmDialog({
  label,
  children,
  confirmLabel,
  onCancel,
  onConfirm,
  returnFocusRef,
}: ConfirmDialogProps) {
  return (
    <ApplicationModal
      label={label}
      onClose={onCancel}
      returnFocusRef={returnFocusRef}
    >
      <p>{children}</p>
      <div className="application-settings-actions">
        <button className="btn" type="button" onClick={onCancel}>
          Cancel
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </ApplicationModal>
  );
}

interface ApplicantProfileSettingsProps {
  initialProfile: ApplicantProfile | null;
  onSaved: (profile: ApplicantProfile) => void;
}

function ApplicantProfileSettings({
  initialProfile,
  onSaved,
}: ApplicantProfileSettingsProps) {
  const [draft, setDraft] = useState(() => profileDraft(initialProfile));
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const incomplete = APPLICANT_PROFILE_FIELD_NAMES.filter(
    (name) => draft[name].field.state === "unknown",
  );

  function updateField(
    name: ApplicantProfileFieldName,
    update: Partial<EditableField>,
  ) {
    setDraft((current) => ({
      ...current,
      [name]: {
        ...current[name],
        ...update,
        field: update.field ?? current[name].field,
      },
    }));
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage("");
    const fields: Partial<ApplicantProfileFields> = {};
    for (const name of APPLICANT_PROFILE_FIELD_NAMES) {
      const item = draft[name];
      let value: unknown = null;
      if (item.field.state === "provided") {
        if (STRUCTURED_PROFILE_FIELDS.has(name) && item.text.trim()) {
          try {
            value = JSON.parse(item.text);
          } catch {
            setError(`${labelFor(name)} must contain valid JSON.`);
            return;
          }
          const shapeError = validateStructuredValue(name, value);
          if (shapeError) {
            setError(shapeError);
            return;
          }
        } else {
          value = item.text;
        }
      }
      fields[name] = {
        ...item.field,
        state: item.field.state,
        value,
      };
    }
    setSaving(true);
    try {
      const saved = await updateApplicantProfile({
        expected_version: initialProfile?.version ?? null,
        ...(fields as ApplicantProfileFields),
      });
      onSaved(saved);
      setDraft(profileDraft(saved));
      setMessage("Profile saved.");
      announceReadinessRefresh();
      saveButtonRef.current?.focus();
    } catch (reason) {
      setError(safeError(reason, "Profile save"));
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="application-settings-section" aria-labelledby="profile-heading">
      <div className="application-settings-section-heading">
        <div>
          <h2 id="profile-heading">Applicant profile</h2>
          <p>Review every confirmed field used to prepare applications.</p>
        </div>
        {initialProfile && <span>Version {initialProfile.version}</span>}
      </div>
      {!initialProfile && (
        <p className="application-settings-empty">
          No applicant profile exists. Create one to establish readiness.
        </p>
      )}
      {incomplete.length > 0 && (
        <aside className="application-settings-guidance" aria-label="Incomplete profile guidance">
          <strong>{incomplete.length} fields are unknown.</strong>{" "}
          Mark each as provided or declined when you can; unknown required data
          may pause an application for review.
        </aside>
      )}
      <form onSubmit={save}>
        <div className="application-profile-grid">
          {APPLICANT_PROFILE_FIELD_NAMES.map((name) => {
            const item = draft[name];
            const label = labelFor(name);
            return (
              <fieldset className="application-profile-field" key={name}>
                <legend>{label}</legend>
                <label>
                  <span>{label} state</span>
                  <select
                    className="form-select"
                    aria-label={`${label} state`}
                    value={item.field.state}
                    onChange={(event) =>
                      updateField(name, {
                        field: {
                          ...item.field,
                          state: event.target.value as ValueState,
                        },
                      })
                    }
                  >
                    <option value="unknown">Unknown</option>
                    <option value="provided">Provided</option>
                    <option value="declined">Declined</option>
                  </select>
                </label>
                <label>
                  <span>{label} value</span>
                  <textarea
                    className="form-input application-settings-textarea"
                    aria-label={`${label} value`}
                    value={item.text}
                    disabled={item.field.state !== "provided"}
                    onChange={(event) =>
                      updateField(name, { text: event.target.value })
                    }
                    spellCheck={!STRUCTURED_PROFILE_FIELDS.has(name)}
                  />
                </label>
                <small>
                  Confirmed: {item.field.state}
                  {STRUCTURED_PROFILE_FIELDS.has(name)
                    ? " · Structured values use JSON"
                    : ""}
                </small>
              </fieldset>
            );
          })}
        </div>
        {error && <p role="alert" className="application-settings-error">{error}</p>}
        <button
          className="btn btn-primary"
          type="submit"
          disabled={saving}
          ref={saveButtonRef}
        >
          {saving
            ? "Saving profile…"
            : initialProfile
              ? "Save profile"
              : "Create profile"}
        </button>
        {message && <p role="status" aria-live="polite">{message}</p>}
      </form>
    </section>
  );
}

interface ResumeCardProps {
  resume: SafeResume;
  onChanged: (resume: SafeResume) => void;
  onDeleted: (resumeId: string) => void;
}

function ResumeCard({ resume, onChanged, onDeleted }: ResumeCardProps) {
  const [label, setLabel] = useState(resume.label);
  const [isDefault, setIsDefault] = useState(resume.is_default);
  const [refreshChecksum, setRefreshChecksum] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  function closeConfirmation() {
    setConfirming(false);
  }

  async function save() {
    setError(null);
    try {
      const saved = await updateResume(resume.resume_id, {
        expected_version: resume.version,
        label,
        is_default: isDefault,
        refresh_checksum: refreshChecksum,
      });
      onChanged(saved);
      setRefreshChecksum(false);
      setMessage("Résumé saved.");
      announceReadinessRefresh();
    } catch (reason) {
      setError(safeError(reason, "Résumé save"));
    }
  }

  async function remove() {
    setError(null);
    try {
      await deleteResume(resume.resume_id, resume.version);
      onDeleted(resume.resume_id);
      announceReadinessRefresh();
    } catch (reason) {
      closeConfirmation();
      setError(safeError(reason, "Résumé delete"));
    }
  }

  return (
    <article className="application-settings-card" aria-label={`Résumé ${resume.label}`}>
      <div className="application-settings-card-title">
        <h3>{resume.label}</h3>
        {resume.is_default && <span className="application-settings-badge">Default</span>}
      </div>
      <dl className="application-settings-safe-details">
        <div><dt>ID</dt><dd>{resume.resume_id}</dd></div>
        <div><dt>Checksum</dt><dd>{resume.checksum_summary}</dd></div>
        <div><dt>Language</dt><dd>{resume.language || "Not specified"}</dd></div>
        <div><dt>Size</dt><dd>{resume.file_size_bytes ?? "Unknown"} bytes</dd></div>
        <div><dt>Version</dt><dd>{resume.version}</dd></div>
      </dl>
      <div className="application-settings-row">
        <label>
          <span>Label</span>
          <input className="form-input" value={label} onChange={(event) => setLabel(event.target.value)} />
        </label>
        <label className="application-settings-check">
          <input type="checkbox" checked={isDefault} onChange={(event) => setIsDefault(event.target.checked)} />
          Default résumé
        </label>
        <label className="application-settings-check">
          <input type="checkbox" checked={refreshChecksum} onChange={(event) => setRefreshChecksum(event.target.checked)} />
          Refresh checksum
        </label>
      </div>
      {error && <p role="alert" className="application-settings-error">{error}</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      <div className="application-settings-actions">
        <button className="btn btn-primary" type="button" onClick={() => void save()}>Save résumé</button>
        <button className="btn" type="button" onClick={() => setConfirming(true)} ref={deleteButtonRef}>Delete résumé</button>
      </div>
      {confirming && (
        <ConfirmDialog
          label={`Delete résumé ${resume.label}?`}
          confirmLabel="Confirm delete résumé"
          onCancel={closeConfirmation}
          onConfirm={() => void remove()}
          returnFocusRef={deleteButtonRef}
        >
          Delete {resume.label}? This cannot be undone.
        </ConfirmDialog>
      )}
    </article>
  );
}

interface ResumeSettingsProps {
  initialResumes: SafeResume[];
}

function ResumeSettings({ initialResumes }: ResumeSettingsProps) {
  const [resumes, setResumes] = useState(initialResumes);
  const [paths, setPaths] = useState({
    resume_id: "",
    label: "",
    source_markdown_path: "",
    upload_pdf_path: "",
    preview_html_path: "",
    language: "en",
    is_default: false,
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const formId = useId();

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setMessage("");
    try {
      const saved = await registerResume({
        ...paths,
        preview_html_path: paths.preview_html_path || null,
      });
      setResumes((current) => [...current, saved]);
      setPaths({
        resume_id: "",
        label: "",
        source_markdown_path: "",
        upload_pdf_path: "",
        preview_html_path: "",
        language: "en",
        is_default: false,
      });
      setMessage("Résumé registered.");
      announceReadinessRefresh();
    } catch (reason) {
      setError(safeError(reason, "Résumé registration"));
    }
  }

  return (
    <section className="application-settings-section" aria-labelledby={`${formId}-heading`}>
      <div className="application-settings-section-heading">
        <div>
          <h2 id={`${formId}-heading`}>Résumés</h2>
          <p>Only safe catalog details are shown after registration.</p>
        </div>
      </div>
      <p className="application-settings-guidance">
        All paths must be relative to the configured resume_root. The backend
        rejects absolute paths, traversal, missing files, and wrong extensions.
      </p>
      <form className="application-settings-form-grid" onSubmit={submit}>
        <label><span>Résumé ID</span><input className="form-input" required value={paths.resume_id} onChange={(event) => setPaths({ ...paths, resume_id: event.target.value })} /></label>
        <label><span>Résumé label</span><input className="form-input" required value={paths.label} onChange={(event) => setPaths({ ...paths, label: event.target.value })} /></label>
        <label><span>Markdown source path</span><input className="form-input" required pattern="(?!/)(?!.*\.\.)[^ ]+\.md" value={paths.source_markdown_path} onChange={(event) => setPaths({ ...paths, source_markdown_path: event.target.value })} /></label>
        <label><span>PDF upload path</span><input className="form-input" required pattern="(?!/)(?!.*\.\.)[^ ]+\.pdf" value={paths.upload_pdf_path} onChange={(event) => setPaths({ ...paths, upload_pdf_path: event.target.value })} /></label>
        <label><span>HTML preview path</span><input className="form-input" pattern="(?!/)(?!.*\.\.)[^ ]+\.html" value={paths.preview_html_path} onChange={(event) => setPaths({ ...paths, preview_html_path: event.target.value })} /></label>
        <label><span>Language</span><input className="form-input" value={paths.language} onChange={(event) => setPaths({ ...paths, language: event.target.value })} /></label>
        <label className="application-settings-check"><input type="checkbox" checked={paths.is_default} onChange={(event) => setPaths({ ...paths, is_default: event.target.checked })} />Default résumé</label>
        <button className="btn btn-primary" type="submit">Register résumé</button>
      </form>
      {error && <p role="alert" className="application-settings-error">{error}</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      {resumes.length === 0 ? (
        <p className="application-settings-empty">No résumés registered</p>
      ) : (
        <div className="application-settings-cards">
          {resumes.map((item) => (
            <ResumeCard
              key={item.resume_id}
              resume={item}
              onChanged={(saved) =>
                setResumes((current) =>
                  current.map((entry) =>
                    entry.resume_id === saved.resume_id ? saved : entry,
                  ),
                )
              }
              onDeleted={(resumeId) =>
                {
                  setResumes((current) =>
                    current.filter((entry) => entry.resume_id !== resumeId),
                  );
                  setMessage("Résumé deleted.");
                }
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

interface AnswerCardProps {
  answer: ReusableAnswer;
  onChanged: (answer: ReusableAnswer) => void;
  onDeleted: (answerId: string) => void;
}

function AnswerCard({ answer, onChanged, onDeleted }: AnswerCardProps) {
  const [text, setText] = useState(answer.answer_text);
  const [jurisdiction, setJurisdiction] = useState(answer.jurisdiction ?? "");
  const [platform, setPlatform] = useState(answer.platform_scope ?? "");
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  function closeConfirmation() {
    setConfirming(false);
  }

  async function save() {
    setError(null);
    try {
      const saved = await updateAnswer(answer.answer_id, {
        question_intent: answer.question_intent,
        answer_text: text,
        jurisdiction: jurisdiction || null,
        platform_scope: platform || null,
        policy_category: answer.policy_category,
        provenance: "owner_authored",
        last_confirmed_at: new Date().toISOString(),
        expires_at: answer.expires_at,
        expected_version: answer.version,
      });
      onChanged(saved);
    } catch (reason) {
      setError(safeError(reason, "Answer save"));
    }
  }

  async function remove() {
    try {
      await deleteAnswer(answer.answer_id, answer.version);
      onDeleted(answer.answer_id);
    } catch (reason) {
      closeConfirmation();
      setError(safeError(reason, "Answer delete"));
    }
  }

  return (
    <article className="application-settings-card" aria-label={`Answer ${answer.answer_id}`}>
      <h3>{labelFor(answer.question_intent)}</h3>
      <p className="application-settings-meta">Answer ID: {answer.answer_id} · Version {answer.version}</p>
      <div className="application-settings-form-grid">
        <label className="application-settings-wide"><span>Answer text</span><textarea className="form-input application-settings-textarea" value={text} onChange={(event) => setText(event.target.value)} /></label>
        <label><span>Jurisdiction</span><input className="form-input" value={jurisdiction} onChange={(event) => setJurisdiction(event.target.value)} /></label>
        <label><span>Platform scope</span><input className="form-input" value={platform} onChange={(event) => setPlatform(event.target.value)} /></label>
      </div>
      {error && <p role="alert" className="application-settings-error">{error}</p>}
      <div className="application-settings-actions">
        <button className="btn btn-primary" type="button" onClick={() => void save()}>Save answer</button>
        <button className="btn" type="button" onClick={() => setConfirming(true)} ref={deleteButtonRef}>Delete answer</button>
      </div>
      {confirming && (
        <ConfirmDialog
          label={`Delete answer ${answer.answer_id}?`}
          confirmLabel="Confirm delete answer"
          onCancel={closeConfirmation}
          onConfirm={() => void remove()}
          returnFocusRef={deleteButtonRef}
        >
          Delete this reusable answer?
        </ConfirmDialog>
      )}
    </article>
  );
}

interface AnswerBankSettingsProps {
  initialAnswers: ReusableAnswer[];
}

function AnswerBankSettings({ initialAnswers }: AnswerBankSettingsProps) {
  const [answers, setAnswers] = useState(initialAnswers);
  const [draft, setDraft] = useState({
    answer_id: "",
    question_intent: "work_authorization" as QuestionIntent,
    answer_text: "",
    jurisdiction: "",
    platform_scope: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const input: ReusableAnswerInput = {
      answer_id: draft.answer_id,
      question_intent: draft.question_intent,
      answer_text: draft.answer_text,
      jurisdiction: draft.jurisdiction || null,
      platform_scope: draft.platform_scope || null,
      policy_category: "approved_reusable" as PolicyCategory,
      provenance: "owner_authored",
      last_confirmed_at: new Date().toISOString(),
      expires_at: null,
    };
    try {
      const saved = await createAnswer(input);
      setAnswers((current) => [...current, saved]);
      setDraft({
        answer_id: "",
        question_intent: "work_authorization",
        answer_text: "",
        jurisdiction: "",
        platform_scope: "",
      });
      setMessage("Answer created.");
    } catch (reason) {
      setError(safeError(reason, "Answer creation"));
    }
  }

  return (
    <section className="application-settings-section" aria-labelledby="answer-bank-heading">
      <div className="application-settings-section-heading">
        <div>
          <h2 id="answer-bank-heading">Answer bank</h2>
          <p>Owner-authored reusable answers remain private to this settings surface.</p>
        </div>
      </div>
      <form className="application-settings-form-grid" onSubmit={submit}>
        <label><span>Answer ID</span><input className="form-input" required value={draft.answer_id} onChange={(event) => setDraft({ ...draft, answer_id: event.target.value })} /></label>
        <label><span>Question intent</span><select className="form-select" value={draft.question_intent} onChange={(event) => setDraft({ ...draft, question_intent: event.target.value as QuestionIntent })}>{QUESTION_INTENTS.map((intent) => <option key={intent} value={intent}>{labelFor(intent)}</option>)}</select></label>
        <label className="application-settings-wide"><span>Answer text</span><textarea className="form-input application-settings-textarea" required value={draft.answer_text} onChange={(event) => setDraft({ ...draft, answer_text: event.target.value })} /></label>
        <label><span>Jurisdiction (optional)</span><input className="form-input" value={draft.jurisdiction} onChange={(event) => setDraft({ ...draft, jurisdiction: event.target.value })} /></label>
        <label><span>Platform scope (optional)</span><input className="form-input" value={draft.platform_scope} onChange={(event) => setDraft({ ...draft, platform_scope: event.target.value })} /></label>
        <button className="btn btn-primary" type="submit">Create answer</button>
      </form>
      {error && <p role="alert" className="application-settings-error">{error}</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      {answers.length === 0 ? (
        <p className="application-settings-empty">No reusable answers saved</p>
      ) : (
        <div className="application-settings-cards">
          {answers.map((item) => (
            <AnswerCard
              key={item.answer_id}
              answer={item}
              onChanged={(saved) =>
                {
                  setAnswers((current) =>
                    current.map((entry) =>
                      entry.answer_id === saved.answer_id ? saved : entry,
                    ),
                  );
                  setMessage("Answer saved.");
                }
              }
              onDeleted={(answerId) =>
                {
                  setAnswers((current) =>
                    current.filter((entry) => entry.answer_id !== answerId),
                  );
                  setMessage("Answer deleted.");
                }
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}

type ResourceState<T> =
  | { status: "loading" }
  | { status: "ready"; value: T }
  | { status: "error"; message: string };

interface SettingsData {
  profile: ResourceState<ApplicantProfile | null>;
  resumes: ResourceState<SafeResume[]>;
  answers: ResourceState<ReusableAnswer[]>;
}

function FailedSettingsSection({
  title,
  message,
  retryLabel,
  onRetry,
}: {
  title: string;
  message: string;
  retryLabel: string;
  onRetry: () => void;
}) {
  return (
    <section className="application-settings-section" aria-label={title}>
      <h2>{title}</h2>
      <p role="alert" className="application-settings-error">{message}</p>
      <button className="btn" type="button" onClick={onRetry}>{retryLabel}</button>
    </section>
  );
}

function LoadingSettingsSection({ title }: { title: string }) {
  return (
    <section
      className="application-settings-section"
      aria-label={title}
      aria-busy="true"
    >
      <h2>{title}</h2>
      <p role="status">Loading…</p>
    </section>
  );
}

export function ApplicationSettings() {
  const [data, setData] = useState<SettingsData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.allSettled([
      fetchApplicantProfile({ signal: controller.signal }),
      fetchResumes({ signal: controller.signal }),
      fetchAnswerBank({}, { signal: controller.signal }),
    ]).then(([profileResult, resumesResult, answersResult]) => {
      if (controller.signal.aborted) {
        return;
      }
      setData({
        profile:
          profileResult.status === "fulfilled"
            ? { status: "ready", value: profileResult.value }
            : profileResult.reason instanceof ApiNotFoundError
              ? { status: "ready", value: null }
              : {
                  status: "error",
                  message: safeError(profileResult.reason, "Profile loading"),
                },
        resumes:
          resumesResult.status === "fulfilled"
            ? { status: "ready", value: resumesResult.value }
            : {
                status: "error",
                message: safeError(resumesResult.reason, "Résumé loading"),
              },
        answers:
          answersResult.status === "fulfilled"
            ? { status: "ready", value: answersResult.value }
            : {
                status: "error",
                message: safeError(answersResult.reason, "Answer-bank loading"),
              },
      });
    });
    return () => controller.abort();
  }, []);

  async function retryProfile() {
    setData((current) =>
      current ? { ...current, profile: { status: "loading" } } : current,
    );
    try {
      const profile = await fetchApplicantProfile();
      setData((current) =>
        current
          ? { ...current, profile: { status: "ready", value: profile } }
          : current,
      );
    } catch (reason) {
      setData((current) =>
        current
          ? {
              ...current,
              profile:
                reason instanceof ApiNotFoundError
                  ? { status: "ready", value: null }
                  : {
                      status: "error",
                      message: safeError(reason, "Profile loading"),
                    },
            }
          : current,
      );
    }
  }

  async function retryResumes() {
    setData((current) =>
      current ? { ...current, resumes: { status: "loading" } } : current,
    );
    try {
      const resumes = await fetchResumes();
      setData((current) =>
        current
          ? { ...current, resumes: { status: "ready", value: resumes } }
          : current,
      );
    } catch (reason) {
      setData((current) =>
        current
          ? {
              ...current,
              resumes: {
                status: "error",
                message: safeError(reason, "Résumé loading"),
              },
            }
          : current,
      );
    }
  }

  async function retryAnswers() {
    setData((current) =>
      current ? { ...current, answers: { status: "loading" } } : current,
    );
    try {
      const answers = await fetchAnswerBank();
      setData((current) =>
        current
          ? { ...current, answers: { status: "ready", value: answers } }
          : current,
      );
    } catch (reason) {
      setData((current) =>
        current
          ? {
              ...current,
              answers: {
                status: "error",
                message: safeError(reason, "Answer-bank loading"),
              },
            }
          : current,
      );
    }
  }

  if (!data) {
    return (
      <div className="application-settings-loading" role="status" aria-live="polite" aria-busy="true">
        Loading application settings…
      </div>
    );
  }

  return (
    <div className="application-settings">
      {data.profile.status === "ready" ? (
        <ApplicantProfileSettings
          initialProfile={data.profile.value}
          onSaved={(profile) =>
            setData((current) =>
              current
                ? {
                    ...current,
                    profile: { status: "ready", value: profile },
                  }
                : current,
            )
          }
        />
      ) : data.profile.status === "error" ? (
        <FailedSettingsSection
          title="Applicant profile"
          message={data.profile.message}
          retryLabel="Retry applicant profile"
          onRetry={() => void retryProfile()}
        />
      ) : (
        <LoadingSettingsSection title="Applicant profile" />
      )}
      {data.resumes.status === "ready" ? (
        <ResumeSettings initialResumes={data.resumes.value} />
      ) : data.resumes.status === "error" ? (
        <FailedSettingsSection
          title="Résumés"
          message={data.resumes.message}
          retryLabel="Retry résumés"
          onRetry={() => void retryResumes()}
        />
      ) : (
        <LoadingSettingsSection title="Résumés" />
      )}
      {data.answers.status === "ready" ? (
        <AnswerBankSettings initialAnswers={data.answers.value} />
      ) : data.answers.status === "error" ? (
        <FailedSettingsSection
          title="Answer bank"
          message={data.answers.message}
          retryLabel="Retry answer bank"
          onRetry={() => void retryAnswers()}
        />
      ) : (
        <LoadingSettingsSection title="Answer bank" />
      )}
    </div>
  );
}
