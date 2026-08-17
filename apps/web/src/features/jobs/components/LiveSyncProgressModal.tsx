"use client";

import { useEffect, useRef } from "react";
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
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Close on Escape key
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

  // Focus management: focus close button when modal opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        closeButtonRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const sourcesList = Object.values(state.sources);
  const totalSources = sourcesList.length;
  const completedSources = sourcesList.filter((s) => s.status !== undefined).length;
  const progressPercent =
    totalSources > 0 ? Math.round((completedSources / totalSources) * 100) : 0;

  const isSyncing = state.status === "connecting" || state.status === "syncing";
  const isCompleted = state.status === "completed";
  const isError = state.status === "error";
  const isCooldown = state.status === "cooldown";

  return (
    <div
      className="live-sync-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="live-sync-title"
        className="live-sync-modal"
      >
        {/* Header */}
        <div className="live-sync-header">
          <div className="live-sync-title-row">
            <h2 id="live-sync-title" className="live-sync-title">
              Live Catalog Synchronization
            </h2>
            <button
              ref={closeButtonRef}
              type="button"
              onClick={onClose}
              className="live-sync-close-btn"
              aria-label="Close live sync dialog"
            >
              ✕
            </button>
          </div>
          <p className="live-sync-description">
            Fetching latest job postings directly from remote source APIs in parallel.
          </p>
        </div>

        {/* Progress Bar */}
        <div className="live-sync-progress-container">
          <div className="live-sync-progress-bar-bg">
            <div
              className={`live-sync-progress-bar-fill ${
                isCompleted ? "live-sync-progress-bar-fill--complete" : ""
              }`}
              style={{ width: `${isCompleted ? 100 : progressPercent}%` }}
              role="progressbar"
              aria-valuenow={isCompleted ? 100 : progressPercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Live sync progress"
            />
          </div>
          <div className="live-sync-progress-label">
            {isSyncing && (
              <span>
                {completedSources} of {totalSources || 3} sources completed ({progressPercent}%)
              </span>
            )}
            {isCompleted && (
              <span className="text-emerald-500 font-medium">
                ✓ Synchronization complete ({state.total_inserted} new, {state.total_updated}{" "}
                updated)
              </span>
            )}
            {isCooldown && (
              <span className="text-amber-500 font-medium">
                ⏳ Cooldown active ({state.cooldown_remaining_seconds}s remaining)
              </span>
            )}
            {isError && (
              <span className="text-rose-500 font-medium">
                ⚠️ Sync failed: {state.error_message}
              </span>
            )}
          </div>
        </div>

        {/* Sources List */}
        <div className="live-sync-sources-list">
          {sourcesList.length === 0 && isSyncing && (
            <div className="live-sync-source-card live-sync-source-card--connecting">
              <span className="live-sync-spinner" aria-hidden="true" />
              <span>Connecting to upstream sources...</span>
            </div>
          )}

          {sourcesList.map((src: SourceLiveState) => {
            const displayName = SOURCE_LABELS[src.source_id] || src.source_id;
            return (
              <div
                key={src.source_id}
                className={`live-sync-source-card live-sync-source-card--${
                  src.status || src.stage
                }`}
                data-testid={`live-sync-source-${src.source_id}`}
              >
                <div className="live-sync-source-info">
                  <span className="live-sync-source-name">{displayName}</span>
                  <span className="live-sync-source-metrics">
                    {src.status === "success" && (
                      <span className="live-sync-metric live-sync-metric--success">
                        +{src.inserted_count} new · {src.updated_count} updated
                      </span>
                    )}
                    {src.status === "partial_success" && (
                      <span className="live-sync-metric live-sync-metric--warning">
                        +{src.inserted_count} new · {src.rejected_count} rejected
                      </span>
                    )}
                    {src.status === "failure" && (
                      <span className="live-sync-metric live-sync-metric--failure">
                        {src.error_summaries[0]?.message || "Source unavailable"}
                      </span>
                    )}
                    {!src.status && src.stage === "fetching" && (
                      <span className="live-sync-metric live-sync-metric--fetching">
                        Fetching API feeds...
                      </span>
                    )}
                    {!src.status && src.stage === "normalizing" && (
                      <span className="live-sync-metric live-sync-metric--normalizing">
                        Normalizing ({src.accepted_count} valid)...
                      </span>
                    )}
                    {!src.status && src.stage === "persisting" && (
                      <span className="live-sync-metric live-sync-metric--persisting">
                        Saving to catalog...
                      </span>
                    )}
                  </span>
                </div>

                <div className="live-sync-source-badge">
                  {src.status === "success" && (
                    <span className="badge-sync-success">✓ Done</span>
                  )}
                  {src.status === "partial_success" && (
                    <span className="badge-sync-warning">⚠️ Partial</span>
                  )}
                  {src.status === "failure" && (
                    <span className="badge-sync-failure">✕ Failed</span>
                  )}
                  {!src.status && (
                    <span className="badge-sync-active">
                      <span className="live-sync-spinner-small" aria-hidden="true" />
                      {src.stage === "fetching"
                        ? "Fetching"
                        : src.stage === "normalizing"
                          ? "Normalizing"
                          : "Persisting"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Live Region for Screen Readers */}
        <div
          role="status"
          aria-live="polite"
          className="sr-only"
          data-testid="live-sync-announcement"
        >
          {liveAnnouncement}
        </div>

        {/* Footer Actions */}
        <div className="live-sync-footer">
          <div className="live-sync-footer-left">
            {isSyncing && (
              <button
                type="button"
                onClick={onCancel}
                className="btn-cancel-sync"
              >
                Cancel Sync
              </button>
            )}
            {(isError || isCooldown) && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isCooldown}
                className="btn-retry-sync"
              >
                Retry
              </button>
            )}
          </div>

          <div className="live-sync-footer-right">
            <button
              type="button"
              onClick={onClose}
              className="btn-dismiss-sync"
            >
              {isSyncing ? "Run in Background" : "Close"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
