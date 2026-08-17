"use client";

import type { LiveSyncStatus } from "../types";

export interface LiveSearchButtonProps {
  onStartSync: () => void;
  status: LiveSyncStatus;
  cooldownSeconds: number | null;
  disabled?: boolean;
}

export function LiveSearchButton({
  onStartSync,
  status,
  cooldownSeconds,
  disabled = false,
}: LiveSearchButtonProps) {
  const isSyncing = status === "connecting" || status === "syncing";
  const isCooldown = status === "cooldown" && cooldownSeconds !== null && cooldownSeconds > 0;

  let buttonText = "Live Search";
  if (isSyncing) {
    buttonText = "Syncing...";
  } else if (isCooldown) {
    buttonText = `Live Sync (${cooldownSeconds}s)`;
  }

  return (
    <button
      type="button"
      onClick={onStartSync}
      disabled={disabled || isSyncing || isCooldown}
      className={`btn-live-search ${isSyncing ? "btn-live-search--syncing" : ""} ${
        isCooldown ? "btn-live-search--cooldown" : ""
      }`}
      aria-haspopup="dialog"
      aria-busy={isSyncing}
      aria-label={
        isCooldown
          ? `Live sync on cooldown. Try again in ${cooldownSeconds} seconds.`
          : isSyncing
            ? "Live synchronization in progress"
            : "Trigger live search and catalog synchronization"
      }
    >
      <span
        className={`live-search-icon ${isSyncing ? "live-search-icon--spin" : ""}`}
        aria-hidden="true"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-4 h-4"
        >
          <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.3" />
        </svg>
      </span>
      <span>{buttonText}</span>
    </button>
  );
}
