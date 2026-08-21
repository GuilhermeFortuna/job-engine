"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  deleteProfileResume,
  fetchProfileResumes,
  sanitizedErrorMessage,
  updateProfileResume,
  uploadResume,
} from "../api";
import { PROFILE_SCOPE_CHANGED_EVENT } from "../events";
import type { ProfileResume } from "../types";
import { FileDropZone } from "./FileDropZone";

interface ResumeDocumentManagerProps {
  profileId: string;
  scopeKey: number;
  onChanged?: (resumes: ProfileResume[]) => void;
}

export function ResumeDocumentManager({
  profileId,
  scopeKey,
  onChanged,
}: ResumeDocumentManagerProps) {
  const [resumes, setResumes] = useState<ProfileResume[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Keep the latest callback without putting it in effect deps — an inline
  // parent onChanged would otherwise retrigger load on every setState.
  const onChangedRef = useRef(onChanged);
  useEffect(() => {
    onChangedRef.current = onChanged;
  }, [onChanged]);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const items = await fetchProfileResumes(profileId, { signal });
      if (signal?.aborted) {
        return;
      }
      setResumes(items);
      onChangedRef.current?.(items);
    } catch (err) {
      if (signal?.aborted) {
        return;
      }
      setResumes([]);
      setError(sanitizedErrorMessage(err));
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [profileId]);

  useEffect(() => {
    const controller = new AbortController();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- load resumes for scoped profile
    void load(controller.signal);
    return () => controller.abort();
  }, [load, scopeKey]);

  useEffect(() => {
    const onScope = () => {
      setResumes([]);
      setLoading(true);
    };
    window.addEventListener(PROFILE_SCOPE_CHANGED_EVENT, onScope);
    return () => window.removeEventListener(PROFILE_SCOPE_CHANGED_EVENT, onScope);
  }, []);

  return (
    <div className="resume-document-manager">
      <FileDropZone
        kind="resume"
        label="Upload a resume"
        hint="Drop a PDF or DOCX here, or choose a file. Local file paths are not accepted."
        onFile={async (file) => {
          const uploaded = await uploadResume(profileId, file, {
            label: file.name,
            isDefault: resumes.length === 0,
          });
          const next = await fetchProfileResumes(profileId);
          setResumes(next.length > 0 ? next : [uploaded]);
          onChangedRef.current?.(next);
        }}
      />

      {loading ? (
        <p role="status" aria-live="polite">
          Loading resumes…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="profile-inline-error">
          {error}
        </p>
      ) : null}

      {resumes.length === 0 && !loading ? (
        <p className="profile-empty">No resumes uploaded yet.</p>
      ) : (
        <ul className="resume-list">
          {resumes.map((resume) => (
            <li key={resume.id} className="resume-list-item">
              <div>
                <strong>{resume.label}</strong>
                {resume.is_default ? (
                  <span className="resume-default-badge">Default</span>
                ) : null}
                <p className="resume-meta">
                  {resume.file_size_bytes != null
                    ? `${Math.round(resume.file_size_bytes / 1024)} KB`
                    : "Saved resume"}
                </p>
              </div>
              <div className="resume-list-actions">
                {!resume.is_default ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    disabled={busyId === resume.id}
                    onClick={() => {
                      setBusyId(resume.id);
                      void updateProfileResume(profileId, resume.resume_id, {
                        expected_version: resume.version,
                        is_default: true,
                      })
                        .then(() => load())
                        .catch(() => setError("Unable to update resume."))
                        .finally(() => setBusyId(null));
                    }}
                  >
                    Make default
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={busyId === resume.id}
                  onClick={() => {
                    setBusyId(resume.id);
                    void deleteProfileResume(
                      profileId,
                      resume.resume_id,
                      resume.version,
                    )
                      .then(() => load())
                      .catch(() => setError("Unable to remove resume."))
                      .finally(() => setBusyId(null));
                  }}
                >
                  Remove
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
