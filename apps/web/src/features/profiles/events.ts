export const PROFILE_SCOPE_CHANGED_EVENT = "job-engine:profile-scope-changed";
export const PROFILE_READINESS_REFRESH_EVENT =
  "job-engine:profile-readiness-refresh";

export function dispatchProfileScopeChanged(profileId: string | null): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(
    new CustomEvent(PROFILE_SCOPE_CHANGED_EVENT, {
      detail: { profileId },
    }),
  );
}

export function dispatchProfileReadinessRefresh(): void {
  if (typeof window === "undefined") {
    return;
  }
  window.dispatchEvent(new Event(PROFILE_READINESS_REFRESH_EVENT));
}
