"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { useProfile } from "../ProfileProvider";
import { ProfileAvatar } from "./ProfileAvatar";

export function ProfileSwitcher() {
  const {
    profiles,
    activeProfile,
    activeProfileId,
    isLoading,
    switchProfile,
  } = useProfile();
  const [open, setOpen] = useState(false);
  const menuId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (
        !menuRef.current?.contains(target) &&
        !buttonRef.current?.contains(target)
      ) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const label = activeProfile?.display_name ?? "No profile";

  return (
    <div className="profile-switcher">
      <Button
        ref={buttonRef}
        type="button"
        variant="outline"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={menuId}
        disabled={isLoading}
        onClick={() => setOpen((value) => !value)}
        className="profile-switcher-trigger"
      >
        {activeProfile ? (
          <ProfileAvatar profile={activeProfile} size="sm" />
        ) : (
          <span className="profile-avatar" data-size="sm" aria-hidden>
            <span className="profile-avatar-initials">?</span>
          </span>
        )}
        <span className="profile-switcher-name">{label}</span>
      </Button>
      {open ? (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label="Applicant profiles"
          className="profile-switcher-menu"
        >
          {profiles.length === 0 ? (
            <p className="profile-switcher-empty" role="none">
              No profiles yet
            </p>
          ) : (
            profiles.map((profile) => {
              const selected = profile.id === activeProfileId;
              return (
                <button
                  key={profile.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={selected}
                  className="profile-switcher-item"
                  onClick={() => {
                    setOpen(false);
                    if (!selected) {
                      void switchProfile(profile.id);
                    }
                  }}
                >
                  <ProfileAvatar profile={profile} size="sm" />
                  <span>{profile.display_name}</span>
                  {selected ? (
                    <span className="profile-switcher-active">Active</span>
                  ) : null}
                </button>
              );
            })
          )}
          <div className="profile-switcher-footer" role="none">
            <Link
              href="/onboarding"
              role="menuitem"
              className="profile-switcher-link"
              onClick={() => setOpen(false)}
            >
              Create profile
            </Link>
            <Link
              href="/profile"
              role="menuitem"
              className="profile-switcher-link"
              onClick={() => setOpen(false)}
            >
              Open Profile
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
