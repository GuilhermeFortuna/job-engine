"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getCapabilities,
  isProductionRuntimeReady,
} from "../desktop-bridge";
import { APPLICATION_READINESS_REFRESH_EVENT } from "../events";
import {
  ApiNotFoundError,
  fetchLocalAiReadiness,
  fetchActiveProfile,
  fetchProfileResumes,
} from "@/features/profiles/api";
import { PROFILE_READINESS_REFRESH_EVENT } from "@/features/profiles/events";
import { composeProductReadiness } from "@/features/profiles/readiness";
import type {
  ApplicantProfile,
  LocalAiReadiness,
  ProductReadiness,
  ProductReadinessLabel,
  ProfileResume,
} from "@/features/profiles/types";

export interface ApplicationReadinessState {
  profile: ApplicantProfile | null;
  resumes: ProfileResume[];
  isReady: boolean;
  readinessLabel: ProductReadinessLabel;
  productReadiness: ProductReadiness;
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
  resumes: ProfileResume[];
  localAi: LocalAiReadiness | null;
  desktopReady: boolean;
  error: string | null;
}

async function loadReadiness(signal: AbortSignal): Promise<LoadedReadiness> {
  const [profileResult, localAiResult, capabilities] = await Promise.all([
    fetchActiveProfile({ signal }).then(
      (profile) => ({ ok: true as const, profile }),
      (reason: unknown) => ({ ok: false as const, reason }),
    ),
    fetchLocalAiReadiness({ signal }).then(
      (localAi) => ({ ok: true as const, localAi }),
      () => ({ ok: false as const, localAi: null }),
    ),
    getCapabilities(),
  ]);

  let profile: ApplicantProfile | null = null;
  let resumes: ProfileResume[] = [];
  let error: string | null = null;

  if (profileResult.ok) {
    profile = profileResult.profile;
    try {
      resumes = await fetchProfileResumes(profile.id, { signal });
    } catch {
      error = errorMessage();
    }
  } else if (!(profileResult.reason instanceof ApiNotFoundError)) {
    error = errorMessage();
  }

  return {
    profile,
    resumes,
    localAi: localAiResult.ok ? localAiResult.localAi : null,
    desktopReady: isProductionRuntimeReady(capabilities),
    error,
  };
}

export function useApplicationReadiness(): ApplicationReadinessState {
  const [profile, setProfile] = useState<ApplicantProfile | null>(null);
  const [resumes, setResumes] = useState<ProfileResume[]>([]);
  const [localAi, setLocalAi] = useState<LocalAiReadiness | null>(null);
  const [desktopReady, setDesktopReady] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);
  const controllerRef = useRef<AbortController | null>(null);

  const productReadiness = useMemo(
    () =>
      composeProductReadiness({
        profile,
        resumes,
        desktopReady,
        localAi,
      }),
    [profile, resumes, desktopReady, localAi],
  );

  const commit = useCallback((loaded: LoadedReadiness) => {
    setProfile(loaded.profile);
    setResumes(loaded.resumes);
    setLocalAi(loaded.localAi);
    setDesktopReady(loaded.desktopReady);
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
    window.addEventListener(PROFILE_READINESS_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(
        APPLICATION_READINESS_REFRESH_EVENT,
        handleRefresh,
      );
      window.removeEventListener(PROFILE_READINESS_REFRESH_EVENT, handleRefresh);
    };
  }, [refresh]);

  return {
    profile,
    resumes,
    isReady:
      productReadiness.label === "Ready for Auto Apply" ||
      productReadiness.label === "Ready with exceptions",
    readinessLabel: productReadiness.label,
    productReadiness,
    isLoading,
    error,
    revision,
    refresh,
  };
}
