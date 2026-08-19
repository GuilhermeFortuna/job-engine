"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ApiConflictError,
  ApiError,
  createApplicationRun,
  fetchResumes,
  overrideDuplicateRun,
} from "../api";
import { getCapabilities } from "../desktop-bridge";
import {
  isHttpsApplicationUrl,
  workspacePath,
  type ApplicationRunConflict,
  type SafeResume,
} from "../types";

export interface ApplicationLauncherProps {
  jobGroupId: string;
  title: string;
  company: string;
  applicationUrl: string;
  sourceName: string;
}

function applicationOrigin(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function ApplicationLauncher({
  jobGroupId,
  title,
  company,
  applicationUrl,
  sourceName,
}: ApplicationLauncherProps) {
  const router = useRouter();
  const titleId = useId();
  const [desktopReady, setDesktopReady] = useState(false);
  const [open, setOpen] = useState(false);
  const [resumes, setResumes] = useState<SafeResume[]>([]);
  const [resumeId, setResumeId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ApplicationRunConflict | null>(null);
  const [overrideReason, setOverrideReason] = useState("");

  const httpsEligible = isHttpsApplicationUrl(applicationUrl);
  const selectedResume = useMemo(
    () => resumes.find((resume) => resume.resume_id === resumeId) ?? resumes[0],
    [resumes, resumeId],
  );

  useEffect(() => {
    let cancelled = false;
    void getCapabilities().then((caps) => {
      if (!cancelled) {
        setDesktopReady(caps.embeddedBrowser === true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    void fetchResumes()
      .then((items) => {
        if (cancelled) {
          return;
        }
        setResumes(items);
        const defaultResume = items.find((item) => item.is_default) ?? items[0];
        setResumeId(defaultResume?.resume_id ?? "");
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Unable to load resumes");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!desktopReady || !httpsEligible) {
    return null;
  }

  const close = () => {
    setOpen(false);
    setError(null);
    setConflict(null);
    setOverrideReason("");
    setLoading(false);
  };

  const startRun = async () => {
    if (!selectedResume || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const created = await createApplicationRun({
        jobGroupId,
        resumeId: selectedResume.resume_id,
      });
      router.push(workspacePath(created.id));
    } catch (err) {
      if (err instanceof ApiConflictError && err.conflicts[0]) {
        setConflict(err.conflicts[0]);
      } else if (err instanceof ApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to start the assisted application.");
      }
    } finally {
      setLoading(false);
    }
  };

  const confirmOverride = async () => {
    if (!conflict || !overrideReason.trim() || loading) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      await overrideDuplicateRun(conflict.existing_run_id, {
        owner_confirmation: "Create a new assisted application run",
        reason: overrideReason.trim(),
      });
      const created = await createApplicationRun({
        jobGroupId,
        resumeId: selectedResume?.resume_id ?? resumeId,
      });
      router.push(workspacePath(created.id));
    } catch (err) {
      if (err instanceof ApiError || err instanceof Error) {
        setError(err.message);
      } else {
        setError("Unable to override the existing application run.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="application-launcher">
      <button
        type="button"
        className="btn btn-primary btn-apply-job-engine"
        onClick={() => setOpen(true)}
      >
        Apply in Job Engine
      </button>

      {open
        ? createPortal(
            <div
              className="application-launcher-backdrop"
              onClick={(event) => {
                if (event.target === event.currentTarget) {
                  close();
                }
              }}
            >
          <div
            className="application-launcher-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
          >
            <h2 id={titleId}>Start assisted application</h2>
            <p>
              One job at a time. Job Engine will assist in the embedded browser.
              Final submission always requires your explicit{" "}
              <strong>Submit application</strong> action.
            </p>
            <dl className="application-launcher-summary">
              <div>
                <dt>Job</dt>
                <dd>{title}</dd>
              </div>
              <div>
                <dt>Company</dt>
                <dd>{company}</dd>
              </div>
              <div>
                <dt>Application origin</dt>
                <dd>{applicationOrigin(applicationUrl)}</dd>
              </div>
              <div>
                <dt>Source</dt>
                <dd>{sourceName}</dd>
              </div>
              <div>
                <dt>Behavior</dt>
                <dd>Assisted fill with manual release before submit</dd>
              </div>
            </dl>

            <fieldset className="application-launcher-resumes">
              <legend>Registered resume</legend>
              {resumes.length === 0 ? (
                <p>No registered resume is available.</p>
              ) : (
                resumes.map((resume) => (
                  <label key={resume.id} className="application-launcher-resume">
                    <input
                      type="radio"
                      name="resume"
                      value={resume.resume_id}
                      checked={resumeId === resume.resume_id}
                      onChange={() => setResumeId(resume.resume_id)}
                    />
                    <span>
                      {resume.label}
                      {resume.is_default ? " (default)" : ""} — checksum{" "}
                      {resume.checksum_summary}
                    </span>
                  </label>
                ))
              )}
            </fieldset>

            {error ? (
              <p role="alert" className="application-launcher-error">
                {error}
              </p>
            ) : null}

            {conflict ? (
              <div className="application-launcher-conflict" role="alert">
                <p>{conflict.message}</p>
                <Link
                  className="btn btn-secondary"
                  href={workspacePath(conflict.existing_run_id)}
                >
                  Open existing application
                </Link>
                <label className="application-launcher-override">
                  Override reason
                  <textarea
                    value={overrideReason}
                    onChange={(event) => setOverrideReason(event.target.value)}
                    rows={3}
                    required
                  />
                </label>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || overrideReason.trim().length === 0}
                  onClick={() => void confirmOverride()}
                >
                  Override and create a new run
                </button>
              </div>
            ) : (
              <div className="application-launcher-actions">
                <button type="button" className="btn btn-secondary" onClick={close}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loading || !selectedResume}
                  onClick={() => void startRun()}
                >
                  {loading ? "Starting…" : "Start assisted application"}
                </button>
              </div>
            )}
          </div>
        </div>,
            document.body,
          )
        : null}
    </div>
  );
}
