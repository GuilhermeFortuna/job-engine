"use client";

import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  ApiConflictError,
  ApiNotFoundError,
  createApplicationRun,
  fetchApplicantProfile,
  fetchResumes,
  overrideDuplicateRun,
} from "../api";
import { openApplicationView } from "../desktop-bridge";
import {
  DESKTOP_OPEN_REQUESTED,
  DESKTOP_OPEN_UNAVAILABLE,
  workspaceLaunchPath,
} from "../launch-outcome";
import type {
  ApplicationRunConflict,
  AutomationMode,
} from "../types";

export interface LaunchSelection {
  resumeId: string;
  mode: AutomationMode;
}

interface ApplicationLaunchOptions {
  jobGroupId: string;
  applicationTargetId: string;
  refreshReadiness: () => Promise<void>;
}

const READINESS_CHANGED =
  "Application readiness changed. Review your profile and registered résumé before launching.";
const READINESS_UNVERIFIED =
  "Unable to verify application readiness. Review readiness before launching.";

export function useApplicationLaunch({
  applicationTargetId,
  refreshReadiness,
}: ApplicationLaunchOptions) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<ApplicationRunConflict | null>(null);
  const [selection, setSelection] = useState<LaunchSelection | null>(null);
  const transactionInFlightRef = useRef(false);

  const verifyReadiness = async (candidate: LaunchSelection) => {
    try {
      const [, resumes] = await Promise.all([
        fetchApplicantProfile(),
        fetchResumes(),
      ]);
      if (!resumes.some((resume) => resume.resume_id === candidate.resumeId)) {
        setError(READINESS_CHANGED);
        void refreshReadiness();
        return false;
      }
      return true;
    } catch (reason) {
      if (reason instanceof ApiNotFoundError) {
        setError(READINESS_CHANGED);
      } else {
        setError(READINESS_UNVERIFIED);
      }
      void refreshReadiness();
      return false;
    }
  };

  const enterWorkspace = async (runId: string) => {
    let viewOpened = false;
    try {
      viewOpened = (await openApplicationView(runId)).success;
    } catch {
      viewOpened = false;
    }
    router.push(
      workspaceLaunchPath(
        runId,
        viewOpened ? DESKTOP_OPEN_REQUESTED : DESKTOP_OPEN_UNAVAILABLE,
      ),
    );
  };

  const createVerifiedRun = async (candidate: LaunchSelection) => {
    const response = await createApplicationRun({
      application_target_ids: [applicationTargetId],
      resume_id: candidate.resumeId,
      automation_mode: candidate.mode,
    });
    await enterWorkspace(response.created_runs[0].id);
  };

  const start = async (candidate: LaunchSelection) => {
    if (transactionInFlightRef.current) {
      return;
    }
    transactionInFlightRef.current = true;
    setSelection(candidate);
    setLoading(true);
    setError(null);
    try {
      if (!(await verifyReadiness(candidate))) {
        return;
      }
      await createVerifiedRun(candidate);
    } catch (reason) {
      if (reason instanceof ApiConflictError && reason.conflicts[0]) {
        setConflict(reason.conflicts[0]);
      } else {
        setError(
          "Unable to create the application run. Review settings and try again.",
        );
      }
    } finally {
      transactionInFlightRef.current = false;
      setLoading(false);
    }
  };

  const confirmOverride = async (overrideReason: string) => {
    if (
      !conflict ||
      !selection ||
      !overrideReason.trim() ||
      transactionInFlightRef.current
    ) {
      return;
    }
    transactionInFlightRef.current = true;
    setLoading(true);
    setError(null);
    try {
      if (!(await verifyReadiness(selection))) {
        return;
      }
      await overrideDuplicateRun(conflict.existing_run_id, {
        owner_confirmation:
          "Create a new application run despite the duplicate",
        reason: overrideReason.trim(),
      });
      if (!(await verifyReadiness(selection))) {
        return;
      }
      await createVerifiedRun(selection);
    } catch {
      setError("Unable to confirm the duplicate override. Try again safely.");
    } finally {
      transactionInFlightRef.current = false;
      setLoading(false);
    }
  };

  const reset = useCallback(() => {
    setLoading(false);
    setError(null);
    setConflict(null);
    setSelection(null);
  }, []);

  return {
    loading,
    error,
    conflict,
    start,
    confirmOverride,
    reset,
  };
}
