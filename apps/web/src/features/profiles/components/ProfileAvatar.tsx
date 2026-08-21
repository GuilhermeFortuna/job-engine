"use client";

import { useState } from "react";
import { assetContentUrl } from "../api";
import type { ApplicantProfile, ProfileSummary } from "../types";

interface ProfileAvatarProps {
  profile: Pick<
    ProfileSummary | ApplicantProfile,
    "id" | "display_name" | "avatar_asset_id"
  >;
  size?: "sm" | "md" | "lg";
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return "?";
  }
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]!.slice(0, 1)}${parts[1]!.slice(0, 1)}`.toUpperCase();
}

export function ProfileAvatar({ profile, size = "md" }: ProfileAvatarProps) {
  const [failedAssetId, setFailedAssetId] = useState<string | null>(null);
  const src =
    profile.avatar_asset_id && failedAssetId !== profile.avatar_asset_id
      ? assetContentUrl(profile.id, profile.avatar_asset_id)
      : null;

  return (
    <span
      className="profile-avatar"
      data-size={size}
      aria-hidden={src ? undefined : true}
    >
      {src ? (
        // Safe managed-asset URL only — never remote employer or arbitrary hosts.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          onError={() => setFailedAssetId(profile.avatar_asset_id)}
        />
      ) : (
        <span className="profile-avatar-initials">{initials(profile.display_name)}</span>
      )}
    </span>
  );
}
