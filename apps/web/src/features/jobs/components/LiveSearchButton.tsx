"use client";

import { RefreshCwIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
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
    <Button
      type="button"
      variant="outline"
      className="text-foreground disabled:opacity-100"
      onClick={onStartSync}
      disabled={disabled || isSyncing || isCooldown}
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
      <RefreshCwIcon
        data-icon="inline-start"
        className={isSyncing ? "animate-spin" : undefined}
      />
      {buttonText}
    </Button>
  );
}
