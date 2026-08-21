"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  getCapabilities,
  isProductionRuntimeReady,
} from "@/features/applications/desktop-bridge";
import {
  deleteAvatar,
  fetchLocalAiReadiness,
  fetchProfileResumes,
  runLocalAiSelfTest,
  sanitizedErrorMessage,
  updateProfile,
  uploadAvatar,
} from "../api";
import { dispatchProfileReadinessRefresh } from "../events";
import { useProfile } from "../ProfileProvider";
import { composeProductReadiness } from "../readiness";
import type {
  LocalAiReadiness,
  ProfileResume,
} from "../types";
import {
  ApplicationFactsForm,
  factsFromProfile,
  factsToFields,
  type ApplicationFactsDraft,
} from "./ApplicationFactsForm";
import { AvatarCropper } from "./AvatarCropper";
import {
  EducationEditor,
  EmploymentEditor,
  StringListEditor,
  TextField,
  providedField,
  type EducationDraft,
  type EmploymentDraft,
} from "./FieldEditors";
import { FileDropZone } from "./FileDropZone";
import { ProfileAvatar } from "./ProfileAvatar";
import { ReadinessPanel } from "./ReadinessPanel";
import { ResumeDocumentManager } from "./ResumeDocumentManager";

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function asEmployment(value: unknown): EmploymentDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      company: String(row.company ?? ""),
      title: String(row.title ?? row.role ?? ""),
      start_date: String(row.start_date ?? ""),
      end_date: String(row.end_date ?? ""),
      description: String(row.description ?? ""),
    };
  });
}

function asEducation(value: unknown): EducationDraft[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
    return {
      institution: String(row.institution ?? ""),
      credential: String(row.credential ?? row.degree ?? ""),
      field_of_study: String(row.field_of_study ?? ""),
      start_date: String(row.start_date ?? ""),
      end_date: String(row.end_date ?? ""),
    };
  });
}

export function ProfilePageView() {
  const {
    activeProfile,
    scopeKey,
    isLoading,
    error,
    refresh,
    setActiveProfileState,
  } = useProfile();

  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [headline, setHeadline] = useState("");
  const [summary, setSummary] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [employment, setEmployment] = useState<EmploymentDraft[]>([]);
  const [education, setEducation] = useState<EducationDraft[]>([]);
  const [facts, setFacts] = useState<ApplicationFactsDraft | null>(null);
  const [resumes, setResumes] = useState<ProfileResume[]>([]);
  const [desktopReady, setDesktopReady] = useState(false);
  const [localAi, setLocalAi] = useState<LocalAiReadiness | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [selfTestBusy, setSelfTestBusy] = useState(false);
  const [desiredRoles, setDesiredRoles] = useState<string[]>([]);
  const [concurrency, setConcurrency] = useState("2");

  useEffect(() => {
    if (!activeProfile) {
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate editors from active profile
    setDisplayName(activeProfile.display_name);
    setFirstName(String(activeProfile.first_name.value ?? ""));
    setLastName(String(activeProfile.last_name.value ?? ""));
    setEmail(String(activeProfile.email.value ?? ""));
    setPhone(String(activeProfile.phone.value ?? ""));
    setHeadline(String(activeProfile.headline.value ?? ""));
    setSummary(String(activeProfile.summary.value ?? ""));
    setSkills(asStringArray(activeProfile.skills.value));
    setEmployment(asEmployment(activeProfile.employment_history.value));
    setEducation(asEducation(activeProfile.education_history.value));
    setFacts(factsFromProfile(activeProfile));
    const prefs = activeProfile.automation_preferences;
    setDesiredRoles(asStringArray(prefs.desired_roles));
    setConcurrency(String(prefs.concurrency ?? 2));
  }, [activeProfile, scopeKey]);

  const refreshChecks = useCallback(async () => {
    if (!activeProfile) {
      return;
    }
    const [ai, currentResumes, capabilities] = await Promise.all([
      fetchLocalAiReadiness().catch(() => null),
      fetchProfileResumes(activeProfile.id),
      getCapabilities(),
    ]);
    setLocalAi(ai);
    setResumes(currentResumes);
    setDesktopReady(isProductionRuntimeReady(capabilities));
  }, [activeProfile]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load readiness inputs for active profile
    void refreshChecks();
  }, [refreshChecks, scopeKey]);

  const readiness = useMemo(
    () =>
      composeProductReadiness({
        profile: activeProfile,
        resumes,
        desktopReady,
        localAi,
      }),
    [activeProfile, resumes, desktopReady, localAi],
  );

  if (isLoading) {
    return (
      <p role="status" aria-live="polite">
        Loading profile…
      </p>
    );
  }

  if (!activeProfile) {
    return (
      <div className="profile-page-empty">
        <h1>Profile</h1>
        <p>Create an applicant profile to manage your information.</p>
        <a className="btn" href="/onboarding">
          Start onboarding
        </a>
      </div>
    );
  }

  const profile = activeProfile;

  async function saveOverview() {
    setBusy(true);
    setSaveError(null);
    setMessage(null);
    try {
      const updated = await updateProfile(profile.id, {
        expected_version: profile.version,
        display_name: displayName.trim() || profile.display_name,
        first_name: providedField(firstName),
        last_name: providedField(lastName),
        email: providedField(email),
        phone: providedField(phone),
        headline: providedField(headline),
        summary: providedField(summary),
      });
      setActiveProfileState(updated);
      setMessage("Overview saved.");
      dispatchProfileReadinessRefresh();
    } catch (err) {
      setSaveError(sanitizedErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveExperience() {
    setBusy(true);
    setSaveError(null);
    try {
      const updated = await updateProfile(profile.id, {
        expected_version: profile.version,
        skills: providedField(skills.filter(Boolean)),
        employment_history: providedField(
          employment.map((item) => ({
            id: crypto.randomUUID(),
            company: item.company,
            title: item.title,
            start_date: item.start_date || null,
            end_date: item.end_date || null,
            description: item.description || null,
          })),
        ),
        education_history: providedField(
          education.map((item) => ({
            id: crypto.randomUUID(),
            institution: item.institution,
            credential: item.credential,
            field_of_study: item.field_of_study || null,
            start_date: item.start_date || null,
            end_date: item.end_date || null,
          })),
        ),
      });
      setActiveProfileState(updated);
      setMessage("Experience saved.");
    } catch (err) {
      setSaveError(sanitizedErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function saveFacts() {
    if (!facts) {
      return;
    }
    setBusy(true);
    setSaveError(null);
    try {
      const updated = await updateProfile(profile.id, {
        expected_version: profile.version,
        ...factsToFields(facts),
      });
      setActiveProfileState(updated);
      setMessage("Application information saved.");
      dispatchProfileReadinessRefresh();
    } catch (err) {
      setSaveError(sanitizedErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences() {
    setBusy(true);
    setSaveError(null);
    try {
      const updated = await updateProfile(profile.id, {
        expected_version: profile.version,
        automation_preferences: {
          ...profile.automation_preferences,
          desired_roles: desiredRoles.filter(Boolean),
          concurrency: Number(concurrency) || 2,
        },
      });
      setActiveProfileState(updated);
      setMessage("Preferences saved.");
    } catch (err) {
      setSaveError(sanitizedErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="profile-page" key={scopeKey}>
      <header className="profile-page-header">
        <div>
          <h1>Profile</h1>
          <p>
            Active applicant: <strong>{profile.display_name}</strong>
          </p>
        </div>
        <ProfileAvatar profile={profile} size="lg" />
      </header>

      {error ? (
        <p role="alert" className="profile-inline-error">
          {error}
        </p>
      ) : null}
      {saveError ? (
        <p role="alert" className="profile-inline-error">
          {saveError}
        </p>
      ) : null}
      {message ? (
        <p role="status" className="profile-inline-success">
          {message}
        </p>
      ) : null}

      <section className="profile-section" aria-labelledby="profile-overview">
        <h2 id="profile-overview">Overview</h2>
        <div className="profile-section-body">
          {avatarFile && avatarPreview ? (
            <AvatarCropper
              imageUrl={avatarPreview}
              onCancel={() => {
                URL.revokeObjectURL(avatarPreview);
                setAvatarPreview(null);
                setAvatarFile(null);
              }}
              onConfirm={async (crop) => {
                await uploadAvatar(profile.id, avatarFile, crop);
                URL.revokeObjectURL(avatarPreview);
                setAvatarPreview(null);
                setAvatarFile(null);
                await refresh();
                dispatchProfileReadinessRefresh();
              }}
            />
          ) : (
            <FileDropZone
              kind="avatar"
              label="Profile photo"
              hint="Drop or choose a square-friendly image."
              onFile={(file) => {
                if (avatarPreview) {
                  URL.revokeObjectURL(avatarPreview);
                }
                setAvatarFile(file);
                setAvatarPreview(URL.createObjectURL(file));
              }}
            />
          )}
          {profile.avatar_asset_id ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                void deleteAvatar(profile.id).then(() => refresh());
              }}
            >
              Remove photo
            </Button>
          ) : null}
          <TextField
            id="profile-display-name"
            label="Display name"
            value={displayName}
            onChange={setDisplayName}
            required
          />
          <TextField
            id="profile-first-name"
            label="First name"
            value={firstName}
            onChange={setFirstName}
            required
          />
          <TextField
            id="profile-last-name"
            label="Last name"
            value={lastName}
            onChange={setLastName}
            required
          />
          <TextField
            id="profile-email"
            label="Email"
            type="email"
            value={email}
            onChange={setEmail}
            required
          />
          <TextField
            id="profile-phone"
            label="Phone"
            type="tel"
            value={phone}
            onChange={setPhone}
          />
          <TextField
            id="profile-headline"
            label="Headline"
            value={headline}
            onChange={setHeadline}
          />
          <TextField
            id="profile-summary"
            label="Summary"
            value={summary}
            onChange={setSummary}
            multiline
          />
          <Button type="button" disabled={busy} onClick={() => void saveOverview()}>
            Save overview
          </Button>
        </div>
      </section>

      <section className="profile-section" aria-labelledby="profile-resume">
        <h2 id="profile-resume">Resume and documents</h2>
        <ResumeDocumentManager
          profileId={profile.id}
          scopeKey={scopeKey}
          onChanged={setResumes}
        />
      </section>

      <section className="profile-section" aria-labelledby="profile-experience">
        <h2 id="profile-experience">Experience</h2>
        <StringListEditor
          id="profile-skills"
          label="Skills"
          values={skills}
          onChange={setSkills}
          placeholder="Add skill"
        />
        <EmploymentEditor items={employment} onChange={setEmployment} />
        <EducationEditor items={education} onChange={setEducation} />
        <Button type="button" disabled={busy} onClick={() => void saveExperience()}>
          Save experience
        </Button>
      </section>

      <section className="profile-section" aria-labelledby="profile-application-info">
        <h2 id="profile-application-info">Application information</h2>
        {facts ? (
          <>
            <ApplicationFactsForm value={facts} onChange={setFacts} />
            <Button type="button" disabled={busy} onClick={() => void saveFacts()}>
              Save application information
            </Button>
          </>
        ) : null}
      </section>

      <section className="profile-section" aria-labelledby="profile-preferences">
        <h2 id="profile-preferences">Job preferences</h2>
        <StringListEditor
          id="profile-desired-roles"
          label="Desired roles"
          values={desiredRoles}
          onChange={setDesiredRoles}
          placeholder="Add role"
        />
        <p className="profile-field-hint">
          Location, remote, and compensation preferences are edited under Application
          information.
        </p>
        <Button type="button" disabled={busy} onClick={() => void savePreferences()}>
          Save preferences
        </Button>
      </section>

      <section className="profile-section" aria-labelledby="profile-automation">
        <h2 id="profile-automation">Automation</h2>
        <TextField
          id="profile-concurrency"
          label="Preferred concurrent applications"
          type="number"
          value={concurrency}
          onChange={setConcurrency}
          hint="Used when batch Auto Apply becomes available."
        />
        <p>
          Desktop runtime:{" "}
          <strong>{desktopReady ? "Available" : "Open the desktop app"}</strong>
        </p>
        <p>
          Local model:{" "}
          <strong>
            {localAi?.local_ai_ready
              ? "Ready"
              : localAi?.local_ai_failure_code || "Not ready"}
          </strong>
        </p>
        <Button type="button" disabled={busy} onClick={() => void savePreferences()}>
          Save automation preferences
        </Button>
      </section>

      <section className="profile-section" aria-labelledby="profile-readiness">
        <h2 id="profile-readiness">Readiness</h2>
        <ReadinessPanel
          readiness={readiness}
          onRetrySelfTest={async () => {
            setSelfTestBusy(true);
            try {
              await runLocalAiSelfTest();
              await refreshChecks();
              dispatchProfileReadinessRefresh();
            } catch {
              setSaveError("Unable to run the local model self-test.");
            } finally {
              setSelfTestBusy(false);
            }
          }}
          selfTestBusy={selfTestBusy}
        />
      </section>
    </div>
  );
}
