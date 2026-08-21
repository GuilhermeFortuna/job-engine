import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { ApiNotFoundError } from "./api";
import { PROFILE_SCOPE_CHANGED_EVENT } from "./events";

const fetchProfiles = vi.fn();
const fetchActiveProfile = vi.fn();
const setActiveProfile = vi.fn();
const createProfileRequest = vi.fn();

vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    fetchProfiles: (...args: unknown[]) => fetchProfiles(...args),
    fetchActiveProfile: (...args: unknown[]) => fetchActiveProfile(...args),
    setActiveProfile: (...args: unknown[]) => setActiveProfile(...args),
    createProfile: (...args: unknown[]) => createProfileRequest(...args),
  };
});

import { ProfileProvider, useProfile } from "./ProfileProvider";

function wrapper({ children }: { children: ReactNode }) {
  return <ProfileProvider>{children}</ProfileProvider>;
}

describe("ProfileProvider", () => {
  beforeEach(() => {
    fetchProfiles.mockReset();
    fetchActiveProfile.mockReset();
    setActiveProfile.mockReset();
    createProfileRequest.mockReset();
    fetchProfiles.mockResolvedValue({
      items: [
        {
          id: "p1",
          display_name: "Ada",
          avatar_asset_id: null,
          onboarding_step: "ready",
          onboarding_completed_at: "2026-01-01T00:00:00Z",
          archived_at: null,
          automation_preferences: {},
          version: 1,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          is_active: true,
        },
      ],
      active_profile_id: "p1",
    });
    fetchActiveProfile.mockResolvedValue({
      id: "p1",
      display_name: "Ada",
      version: 1,
    });
  });

  it("loads the active profile", async () => {
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfileId).toBe("p1");
    expect(result.current.profiles).toHaveLength(1);
  });

  it("clears active profile and bumps scope key before switch completes", async () => {
    let resolveFetch: ((value: unknown) => void) | undefined;
    const delayed = new Promise((resolve) => {
      resolveFetch = resolve;
    });

    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.activeProfileId).toBe("p1"));
    const scopeBefore = result.current.scopeKey;

    setActiveProfile.mockResolvedValue({
      status: "ok",
      active_profile_id: "p2",
    });
    fetchProfiles.mockReturnValue(delayed);
    fetchActiveProfile.mockReturnValue(delayed);

    const events: string[] = [];
    const listener = () => events.push("scope");
    window.addEventListener(PROFILE_SCOPE_CHANGED_EVENT, listener);

    let switchPromise: Promise<void> | undefined;
    act(() => {
      switchPromise = result.current.switchProfile("p2");
    });

    expect(result.current.activeProfile).toBeNull();
    expect(result.current.scopeKey).toBe(scopeBefore + 1);
    expect(events).toContain("scope");

    fetchProfiles.mockResolvedValue({
      items: [
        {
          id: "p2",
          display_name: "Grace",
          avatar_asset_id: null,
          onboarding_step: "ready",
          onboarding_completed_at: null,
          archived_at: null,
          automation_preferences: {},
          version: 1,
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          is_active: true,
        },
      ],
      active_profile_id: "p2",
    });
    fetchActiveProfile.mockResolvedValue({
      id: "p2",
      display_name: "Grace",
      version: 1,
    });
    resolveFetch?.({ ok: true });
    await act(async () => {
      await switchPromise;
    });

    window.removeEventListener(PROFILE_SCOPE_CHANGED_EVENT, listener);
    expect(result.current.activeProfileId).toBe("p2");
  });

  it("treats missing active profile as empty, not an error", async () => {
    fetchProfiles.mockResolvedValue({ items: [], active_profile_id: null });
    fetchActiveProfile.mockRejectedValue(new ApiNotFoundError("missing"));
    const { result } = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.activeProfile).toBeNull();
    expect(result.current.error).toBeNull();
  });
});
