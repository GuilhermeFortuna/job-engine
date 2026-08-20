"use client";

import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  useApplicationCapability,
  type ApplicationCapabilityIdentity,
} from "../hooks/useApplicationCapability";
import {
  useApplicationLaunch,
  type LaunchSelection,
} from "../hooks/useApplicationLaunch";
import type { CapabilityInputs } from "../projections";
import {
  FULL_AUTO_MODE,
  FULL_AUTO_OWNER_CONFIRMATION,
  SEMI_AUTO_MODE,
  workspacePath,
  type AutomationMode,
} from "../types";
import { ApplicationModal } from "./ApplicationModal";

export interface ApplicationLauncherProps {
  jobGroupId: string;
  title: string;
  company: string;
  applicationUrl: string | null | undefined;
  sourceName: string;
  providerTier?: CapabilityInputs["providerTier"];
}

interface OpenConfirmation {
  capabilityIdentity: ApplicationCapabilityIdentity;
  jobGroupId: string;
}

function applicationDomain(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "Invalid application URL";
  }
}

function modeLabel(mode: AutomationMode): string {
  switch (mode) {
    case FULL_AUTO_MODE:
      return "Full auto";
    case SEMI_AUTO_MODE:
      return "Assisted";
    default: {
      const exhaustive: never = mode;
      throw new Error(`Unhandled automation mode: ${String(exhaustive)}`);
    }
  }
}

export function ApplicationLauncher({
  jobGroupId,
  title,
  company,
  applicationUrl,
  sourceName,
  providerTier = "measured",
}: ApplicationLauncherProps) {
  const launcherFallbackRef = useRef<HTMLDivElement>(null);
  const launchButtonRef = useRef<HTMLButtonElement>(null);
  const [openConfirmation, setOpenConfirmation] =
    useState<OpenConfirmation | null>(null);
  const [resumeId, setResumeId] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const { capability, confirmationIdentity, readiness } =
    useApplicationCapability(applicationUrl, providerTier);
  const launch = useApplicationLaunch({
    jobGroupId,
    refreshReadiness: readiness.refresh,
  });
  const { reset: resetLaunch } = launch;
  const selectedResume = useMemo(
    () =>
      readiness.resumes.find((resume) => resume.resume_id === resumeId) ??
      readiness.resumes.find((resume) => resume.is_default) ??
      readiness.resumes[0],
    [readiness.resumes, resumeId],
  );

  const close = useCallback(() => {
    setOpenConfirmation(null);
    setOverrideReason("");
    resetLaunch();
  }, [resetLaunch]);

  const assisted = capability.state === "ASSISTED";
  const mode: AutomationMode = assisted ? SEMI_AUTO_MODE : FULL_AUTO_MODE;
  const launchLabel = assisted ? "Apply with assistance" : "Auto apply";
  const modalLabel = assisted
    ? "Start assisted application"
    : "Authorize auto apply";

  const startRun = () => {
    if (!selectedResume) {
      return;
    }
    const selection: LaunchSelection = {
      resumeId: selectedResume.resume_id,
      mode,
    };
    void launch.start(selection);
  };

  return (
    <div
      className="application-launcher"
      ref={launcherFallbackRef}
      tabIndex={-1}
      aria-label="Application launcher"
    >
      {capability.state === "UNAVAILABLE" ? (
        <div role="status">
          <strong>Automation unavailable</strong>
          <span>{capability.reasonText}</span>
        </div>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-primary btn-apply-job-engine"
            onClick={() =>
              setOpenConfirmation({
                capabilityIdentity: confirmationIdentity,
                jobGroupId,
              })
            }
            ref={launchButtonRef}
          >
            {launchLabel}
          </button>

          {openConfirmation?.capabilityIdentity === confirmationIdentity &&
          openConfirmation.jobGroupId === jobGroupId ? (
            <ApplicationModal
              label={modalLabel}
              onClose={close}
              returnFocusRef={launchButtonRef}
              fallbackFocusRef={launcherFallbackRef}
            >
              <h2>{modalLabel}</h2>
              <p>
                {assisted
                  ? "Job Engine assists in the embedded browser. You make the final release before submission."
                  : "Routine success requires no second release click. Genuine exceptions pause for owner input."}
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
                  <dt>Origin</dt>
                  <dd>{sourceName}</dd>
                </div>
                <div>
                  <dt>Application URL domain</dt>
                  <dd>{applicationDomain(applicationUrl ?? "")}</dd>
                </div>
                <div>
                  <dt>Mode</dt>
                  <dd>{modeLabel(mode)}</dd>
                </div>
                <div>
                  <dt>Exception behavior</dt>
                  <dd>Genuine exceptions pause for owner input.</dd>
                </div>
              </dl>

              <fieldset className="application-launcher-resumes">
                <legend>Selected registered résumé</legend>
                {readiness.resumes.map((resume) => (
                  <label key={resume.id} className="application-launcher-resume">
                    <input
                      type="radio"
                      name={`resume-${jobGroupId}`}
                      value={resume.resume_id}
                      checked={selectedResume?.resume_id === resume.resume_id}
                      onChange={() => setResumeId(resume.resume_id)}
                    />
                    <span>
                      {resume.label}
                      {resume.is_default ? " (default)" : ""} — checksum{" "}
                      {resume.checksum_summary}
                    </span>
                  </label>
                ))}
              </fieldset>

              {!assisted ? <p>{FULL_AUTO_OWNER_CONFIRMATION}</p> : null}
              {launch.error ? <p role="alert">{launch.error}</p> : null}

              {launch.conflict ? (
                <div className="application-launcher-conflict" role="alert">
                  <p>
                    An existing application run conflicts with this selection.
                    Duplicate confirmation is separate from mode authorization.
                  </p>
                  <Link
                    className="btn btn-secondary"
                    href={workspacePath(launch.conflict.existing_run_id)}
                  >
                    Open existing application
                  </Link>
                  <label className="application-launcher-override">
                    Override reason
                    <textarea
                      value={overrideReason}
                      onChange={(event) =>
                        setOverrideReason(event.target.value)
                      }
                      rows={3}
                      required
                    />
                  </label>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={
                      launch.loading || overrideReason.trim().length === 0
                    }
                    onClick={() =>
                      void launch.confirmOverride(overrideReason)
                    }
                  >
                    Override and create a new run
                  </button>
                </div>
              ) : (
                <div className="application-launcher-actions">
                  <button
                    type="button"
                    className="btn btn-secondary"
                    onClick={close}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={launch.loading || !selectedResume}
                    onClick={startRun}
                  >
                    {launch.loading
                      ? "Starting…"
                      : assisted
                        ? "Start assisted application"
                        : "Authorize and auto apply"}
                  </button>
                </div>
              )}
            </ApplicationModal>
          ) : null}
        </>
      )}
    </div>
  );
}
