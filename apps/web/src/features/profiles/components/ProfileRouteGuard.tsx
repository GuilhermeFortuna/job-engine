"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useProfile } from "../ProfileProvider";

const GUARDED_PREFIXES = ["/jobs", "/applications", "/profile"];

export function ProfileRouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { profiles, isLoading, activeProfileId } = useProfile();

  const needsProfile = GUARDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  useEffect(() => {
    if (isLoading || !needsProfile) {
      return;
    }
    if (profiles.length === 0) {
      router.replace("/onboarding");
    }
  }, [isLoading, needsProfile, profiles.length, router]);

  if (isLoading && needsProfile) {
    return (
      <p role="status" aria-live="polite" className="profile-route-loading">
        Checking profile…
      </p>
    );
  }

  if (needsProfile && profiles.length === 0) {
    return null;
  }

  // Avoid flashing prior-profile route content while a switch clears active id.
  if (
    needsProfile &&
    pathname.startsWith("/profile") &&
    !activeProfileId &&
    profiles.length > 0
  ) {
    return (
      <p role="status" aria-live="polite" className="profile-route-loading">
        Switching profile…
      </p>
    );
  }

  return children;
}
