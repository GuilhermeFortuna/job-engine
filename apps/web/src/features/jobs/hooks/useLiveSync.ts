"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiCooldownError, streamLiveSync } from "../api";
import type {
  LiveSyncState,
  SourceLiveState,
  SyncCompletedEvent,
  SyncSourceCompletedEvent,
  SyncSourceProgressEvent,
  SyncStartedEvent,
} from "../types";

const INITIAL_STATE: LiveSyncState = {
  status: "idle",
  sources: {},
  total_inserted: 0,
  total_updated: 0,
  total_stale: 0,
  started_at: null,
  completed_at: null,
  error_message: null,
  cooldown_remaining_seconds: null,
};

export function useLiveSync() {
  const router = useRouter();
  const [state, setState] = useState<LiveSyncState>(INITIAL_STATE);
  const [isOpen, setIsOpen] = useState(false);
  const [liveAnnouncement, setLiveAnnouncement] = useState("");
  const abortControllerRef = useRef<AbortController | null>(null);

  // Cooldown countdown timer
  useEffect(() => {
    if (state.status !== "cooldown" || !state.cooldown_remaining_seconds) {
      return;
    }

    const timer = setInterval(() => {
      setState((prev) => {
        if (!prev.cooldown_remaining_seconds || prev.cooldown_remaining_seconds <= 1) {
          return {
            ...prev,
            status: "idle",
            cooldown_remaining_seconds: null,
            error_message: null,
          };
        }
        return {
          ...prev,
          cooldown_remaining_seconds: prev.cooldown_remaining_seconds - 1,
        };
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [state.status, state.cooldown_remaining_seconds]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const openModal = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  const reset = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState(INITIAL_STATE);
    setLiveAnnouncement("");
  }, []);

  const cancelSync = useCallback(() => {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setState((prev) => ({
      ...prev,
      status: "idle",
      error_message: "Live sync cancelled by user",
    }));
    setLiveAnnouncement("Live sync cancelled.");
  }, []);

  const startSync = useCallback(async () => {
    abortControllerRef.current?.abort();
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    setState({
      status: "connecting",
      sources: {},
      total_inserted: 0,
      total_updated: 0,
      total_stale: 0,
      started_at: new Date().toISOString(),
      completed_at: null,
      error_message: null,
      cooldown_remaining_seconds: null,
    });
    setIsOpen(true);
    setLiveAnnouncement("Initiating live sync across job sources...");

    try {
      await streamLiveSync(
        {
          onStarted: (event: SyncStartedEvent) => {
            const initialSources: Record<string, SourceLiveState> = {};
            for (const src of event.sources) {
              initialSources[src] = {
                source_id: src,
                stage: "fetching",
                fetched_count: 0,
                accepted_count: 0,
                rejected_count: 0,
                inserted_count: 0,
                updated_count: 0,
                marked_stale_count: 0,
                error_summaries: [],
              };
            }
            setState((prev) => ({
              ...prev,
              status: "syncing",
              sources: initialSources,
              started_at: event.started_at,
            }));
            setLiveAnnouncement(
              `Live sync started for ${event.sources.length} sources: ${event.sources.join(", ")}.`,
            );
          },
          onSourceProgress: (event: SyncSourceProgressEvent) => {
            setState((prev) => {
              const current = prev.sources[event.source_id] || {
                source_id: event.source_id,
                stage: "fetching",
                fetched_count: 0,
                accepted_count: 0,
                rejected_count: 0,
                inserted_count: 0,
                updated_count: 0,
                marked_stale_count: 0,
                error_summaries: [],
              };
              return {
                ...prev,
                sources: {
                  ...prev.sources,
                  [event.source_id]: {
                    ...current,
                    stage: event.stage,
                    fetched_count: event.fetched_count,
                    accepted_count: event.accepted_count,
                    rejected_count: event.rejected_count,
                  },
                },
              };
            });
          },
          onSourceCompleted: (event: SyncSourceCompletedEvent) => {
            setState((prev) => {
              const current = prev.sources[event.source_id] || {
                source_id: event.source_id,
                stage: "persisting",
                fetched_count: 0,
                accepted_count: 0,
                rejected_count: 0,
                inserted_count: 0,
                updated_count: 0,
                marked_stale_count: 0,
                error_summaries: [],
              };
              return {
                ...prev,
                sources: {
                  ...prev.sources,
                  [event.source_id]: {
                    ...current,
                    status: event.status,
                    inserted_count: event.inserted_count,
                    updated_count: event.updated_count,
                    marked_stale_count: event.marked_stale_count,
                    error_summaries: event.error_summaries,
                  },
                },
              };
            });
            setLiveAnnouncement(
              `Source ${event.source_id} completed with status ${event.status}. Inserted ${event.inserted_count} new postings.`,
            );
          },
          onCompleted: (event: SyncCompletedEvent) => {
            setState((prev) => ({
              ...prev,
              status: "completed",
              total_inserted: event.total_inserted,
              total_updated: event.total_updated,
              total_stale: event.total_stale,
              completed_at: event.completed_at,
            }));
            setLiveAnnouncement(
              `Live sync completed. Inserted ${event.total_inserted} new postings, updated ${event.total_updated}. Refreshing search results...`,
            );
            // Revalidate server components to fetch fresh search results under active URL query parameters
            router.refresh();
          },
          onError: (error: Error) => {
            if (error instanceof ApiCooldownError) {
              setState((prev) => ({
                ...prev,
                status: "cooldown",
                cooldown_remaining_seconds: error.retryAfterSeconds,
                error_message: `Live sync is in cooldown. Please wait ${error.retryAfterSeconds}s.`,
              }));
              setLiveAnnouncement(
                `Live sync cooldown active. Please wait ${error.retryAfterSeconds} seconds.`,
              );
            } else {
              setState((prev) => ({
                ...prev,
                status: "error",
                error_message: error.message,
              }));
              setLiveAnnouncement(`Live sync failed: ${error.message}`);
            }
          },
        },
        abortController.signal,
      );
    } catch {
      // Errors handled via onError callback
    }
  }, [router]);

  return {
    state,
    isOpen,
    openModal,
    closeModal,
    startSync,
    cancelSync,
    reset,
    liveAnnouncement,
  };
}
