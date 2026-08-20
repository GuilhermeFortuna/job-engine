"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ApiNotFoundError,
  fetchApplicantProfile,
  fetchResumes,
} from "../api";
import { APPLICATION_READINESS_REFRESH_EVENT } from "../events";
import type { ApplicantProfile, SafeResume } from "../types";

export interface ApplicationReadinessState {
  profile: ApplicantProfile | null;
  resumes: SafeResume[];
  isReady: boolean;
  isLoading: boolean;
  error: string | null;
  revision: number;
  refresh: () => Promise<void>;
}

function errorMessage(): string {
  return "Unable to load application readiness.";
}

interface LoadedReadiness {
  profile: ApplicantProfile | null;
  resumes: SafeResume[];
  error: string | null;
}

async function loadReadiness(signal: AbortSignal): Promise<LoadedReadiness> {
  const [profileResult, resumesResult] = await Promise.allSettled([
    fetchApplicantProfile({ signal }),
    fetchResumes({ signal }),
  ]);
  let profile: ApplicantProfile | null = null;
  let resumes: SafeResume[] = [];
  let error: string | null = null;

  if (profileResult.status === "fulfilled") {
    profile = profileResult.value;
  } else if (!(profileResult.reason instanceof ApiNotFoundError)) {
    error = errorMessage();
  }
  if (resumesResult.status === "fulfilled") {
    resumes = resumesResult.value;
  } else {
    error ??= errorMessage();
  }
  return { profile, resumes, error };
}

export function useApplicationReadiness(): ApplicationReadinessState {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [resumes, setResumes] = useState<SafeResume[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const commit = useCallback((loaded: LoadedReadiness) => {
    setProfile(loaded.profile);
    setResumes(loaded.resumes);
    setError(loaded.error);
    setIsLoading(false);
    setRevision((current) => current + 1);
  }, []);

  const refresh = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    const loaded = await loadReadiness(controller.signal);
    if (controller.signal.aborted) {
      return;
    }
    commit(loaded);
  }, [commit]);

  useEffect(() => {
    const controller = new AbortController();
    controllerRef.current = controller;
    void loadReadiness(controller.signal).then((loaded) => {
      if (!controller.signal.aborted) {
        commit(loaded);
      }
    });
    return () => {
      controllerRef.current?.abort();
    };
  }, [commit]);

  useEffect(() => {
    const handleRefresh = () => {
      void refresh();
    };
    window.addEventListener(APPLICATION_READINESS_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(
        APPLICATION_READINESS_REFRESH_EVENT,
        handleRefresh,
      );
    };
  }, [refresh]);

  return {
    profile,
    resumes,
    isReady: profile !== null && resumes.length > 0,
    isLoading,
    error,
    revision,
    refresh,
  };
}
