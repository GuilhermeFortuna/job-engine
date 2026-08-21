"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ApiNotFoundError,
  createProfile as createProfileRequest,
  fetchActiveProfile,
  fetchProfiles,
  sanitizedErrorMessage,
  setActiveProfile,
} from "./api";
import {
  dispatchProfileReadinessRefresh,
  dispatchProfileScopeChanged,
} from "./events";
import type { ApplicantProfile, ProfileCreateInput, ProfileSummary } from "./types";

export interface ProfileContextValue {
  profiles: ProfileSummary[];
  activeProfile: ApplicantProfile | null;
  activeProfileId: string | null;
  /** Monotonic key — bump on every profile switch so scoped hooks remount. */
  scopeKey: number;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  switchProfile: (profileId: string) => Promise<void>;
  createProfile: (input: ProfileCreateInput) => Promise<ApplicantProfile>;
  setActiveProfileState: (profile: ApplicantProfile | null) => void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [profiles, setProfiles] = useState<ProfileSummary[]>([]);
  const [activeProfile, setActiveProfileState] =
    useState<ApplicantProfile | null>(null);
  const [scopeKey, setScopeKey] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const requestGeneration = useRef(0);

  const load = useCallback(async () => {
    const generation = ++requestGeneration.current;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setIsLoading(true);
    setError(null);
    try {
      const list = await fetchProfiles({ signal: controller.signal });
      if (controller.signal.aborted || generation !== requestGeneration.current) {
        return;
      }
      setProfiles(list.items.filter((item) => !item.archived_at));
      if (!list.active_profile_id) {
        setActiveProfileState(null);
        return;
      }
      try {
        const active = await fetchActiveProfile({ signal: controller.signal });
        if (controller.signal.aborted || generation !== requestGeneration.current) {
          return;
        }
        setActiveProfileState(active);
      } catch (err) {
        if (err instanceof ApiNotFoundError) {
          setActiveProfileState(null);
        } else {
          throw err;
        }
      }
    } catch (err) {
      if (controller.signal.aborted || generation !== requestGeneration.current) {
        return;
      }
      setError(sanitizedErrorMessage(err));
      setProfiles([]);
      setActiveProfileState(null);
    } finally {
      if (!controller.signal.aborted && generation === requestGeneration.current) {
        setIsLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap active profile from API
    void load();
    return () => {
      controllerRef.current?.abort();
    };
  }, [load]);

  const switchProfile = useCallback(async (profileId: string) => {
    const generation = ++requestGeneration.current;
    // Invalidate scoped UI immediately so stale profile data cannot flash.
    setScopeKey((key) => key + 1);
    setActiveProfileState(null);
    dispatchProfileScopeChanged(profileId);
    await setActiveProfile(profileId);
    if (generation !== requestGeneration.current) {
      return;
    }
    const [list, active] = await Promise.all([
      fetchProfiles(),
      fetchActiveProfile(),
    ]);
    if (generation !== requestGeneration.current) {
      return;
    }
    setProfiles(list.items.filter((item) => !item.archived_at));
    setActiveProfileState(active);
    dispatchProfileReadinessRefresh();
  }, []);

  const createProfile = useCallback(
    async (input: ProfileCreateInput) => {
      const created = await createProfileRequest(input);
      await setActiveProfile(created.id);
      setScopeKey((key) => key + 1);
      dispatchProfileScopeChanged(created.id);
      await load();
      dispatchProfileReadinessRefresh();
      return created;
    },
    [load],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      profiles,
      activeProfile,
      activeProfileId: activeProfile?.id ?? null,
      scopeKey,
      isLoading,
      error,
      refresh: load,
      switchProfile,
      createProfile,
      setActiveProfileState: (profile) => {
        setActiveProfileState(profile);
      },
    }),
    [
      profiles,
      activeProfile,
      scopeKey,
      isLoading,
      error,
      load,
      switchProfile,
      createProfile,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (!value) {
    throw new Error("useProfile must be used within ProfileProvider");
  }
  return value;
}
