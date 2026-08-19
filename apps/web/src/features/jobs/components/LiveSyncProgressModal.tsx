"use client";

import { useEffect, useRef } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import type { LiveSyncState, SourceLiveState } from "../types";

export interface LiveSyncProgressModalProps {
  isOpen: boolean;
  state: LiveSyncState;
  onClose: () => void;
  onCancel: () => void;
  onRetry: () => void;
  liveAnnouncement?: string;
}

const SOURCE_LABELS: Record<string, string> = {
  himalayas: "Himalayas",
  jobicy: "Jobicy",
  remoteok: "Remote OK",
};

export function LiveSyncProgressModal({
  isOpen,
  state,
  onClose,
  onCancel,
  onRetry,
  liveAnnouncement,
}: LiveSyncProgressModalProps) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  const sourcesList = Object.values(state.sources);
  const totalSources = sourcesList.length;
  const completedSources = sourcesList.filter((s) => s.status !== undefined).length;
  const progressPercent =
    totalSources > 0 ? Math.round((completedSources / totalSources) * 100) : 0;

  const isSyncing = state.status === "connecting" || state.status === "syncing";
  const isCompleted = state.status === "completed";
  const isError = state.status === "error";
  const isCooldown = state.status === "cooldown";

  if (!isOpen) return null;

  return (
    <Dialog
      open={isOpen}
      modal={false}
      disablePointerDismissal
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-lg"
        aria-labelledby="live-sync-title"
      >
        <DialogHeader>
          <div className="flex items-start justify-between gap-3">
            <DialogTitle id="live-sync-title">
              Live Catalog Synchronization
            </DialogTitle>
            <Button
              ref={closeButtonRef}
              type="button"
              variant="ghost"
              size="icon-sm"
              onClick={onClose}
              aria-label="Close live sync dialog"
            >
              ✕
            </Button>
          </div>
          <DialogDescription>
            Fetching latest job postings directly from remote source APIs in parallel.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2">
          <Progress
            value={isCompleted ? 100 : progressPercent}
            aria-label="Live sync progress"
          />
          <div className="flex justify-between text-xs text-muted-foreground">
            {isSyncing && (
              <span>
                {completedSources} of {totalSources || 3} sources completed ({progressPercent}%)
              </span>
            )}
            {isCompleted && (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                ✓ Synchronization complete ({state.total_inserted} new, {state.total_updated}{" "}
                updated)
              </span>
            )}
            {isCooldown && (
              <span className="font-medium text-amber-600 dark:text-amber-400">
                ⏳ Cooldown active ({state.cooldown_remaining_seconds}s remaining)
              </span>
            )}
            {isError && (
              <span className="font-medium text-destructive">
                ⚠️ Sync failed: {state.error_message}
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          {sourcesList.length === 0 && isSyncing && (
            <div className="flex items-center justify-center gap-3 rounded-lg border border-border bg-background p-3 text-sm font-medium">
              <span className="size-4 animate-spin rounded-full border-2 border-border border-t-primary" aria-hidden="true" />
              <span>Connecting to upstream sources...</span>
            </div>
          )}

          {sourcesList.map((src: SourceLiveState) => {
            const displayName = SOURCE_LABELS[src.source_id] || src.source_id;
            return (
              <div
                key={src.source_id}
                className="flex items-center justify-between rounded-lg border border-border bg-background px-4 py-3"
                data-testid={`live-sync-source-${src.source_id}`}
              >
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm font-semibold">{displayName}</span>
                  <span className="text-xs">
                    {src.status === "success" && (
                      <span className="text-emerald-700 dark:text-emerald-400">
                        +{src.inserted_count} new · {src.updated_count} updated
                      </span>
                    )}
                    {src.status === "partial_success" && (
                      <span className="text-amber-700 dark:text-amber-400">
                        +{src.inserted_count} new · {src.rejected_count} rejected
                      </span>
                    )}
                    {src.status === "failure" && (
                      <span className="text-destructive">
                        {src.error_summaries[0]?.message || "Source unavailable"}
                      </span>
                    )}
                    {!src.status && src.stage === "fetching" && (
                      <span className="text-muted-foreground">Fetching API feeds...</span>
                    )}
                    {!src.status && src.stage === "normalizing" && (
                      <span className="text-blue-700 dark:text-blue-400">
                        Normalizing ({src.accepted_count} valid)...
                      </span>
                    )}
                    {!src.status && src.stage === "persisting" && (
                      <span className="text-violet-700 dark:text-violet-400">
                        Saving to catalog...
                      </span>
                    )}
                  </span>
                </div>

                <div>
                  {src.status === "success" && <Badge variant="success">✓ Done</Badge>}
                  {src.status === "partial_success" && (
                    <Badge variant="warning">⚠️ Partial</Badge>
                  )}
                  {src.status === "failure" && (
                    <Badge variant="destructive">✕ Failed</Badge>
                  )}
                  {!src.status && (
                    <Badge variant="remote">
                      {src.stage === "fetching"
                        ? "Fetching"
                        : src.stage === "normalizing"
                          ? "Normalizing"
                          : "Persisting"}
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div
          role="status"
          aria-live="polite"
          className="sr-only"
          data-testid="live-sync-announcement"
        >
          {liveAnnouncement}
        </div>

        <DialogFooter className="sm:justify-between">
          <div className="flex items-center gap-2">
            {isSyncing && (
              <Button type="button" variant="outline" onClick={onCancel}>
                Cancel Sync
              </Button>
            )}
            {(isError || isCooldown) && (
              <Button
                type="button"
                variant="outline"
                onClick={onRetry}
                disabled={isCooldown}
              >
                Retry
              </Button>
            )}
          </div>
          <Button type="button" onClick={onClose}>
            {isSyncing ? "Run in Background" : "Close"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
