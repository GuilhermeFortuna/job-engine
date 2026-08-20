"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchApplicationRuns,
  streamApplicationRunEvents,
} from "../api";
import type { ApplicationRunList } from "../types";

export type RunEventsConnectionState =
  | "connecting"
  | "connected"
  | "degraded";

export interface ApplicationRunsState {
  runs: ApplicationRunList | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  loadMoreError: string | null;
  connectionState: RunEventsConnectionState;
  isStale: boolean;
  streamError: string | null;
  hasMore: boolean;
  refresh: () => Promise<void>;
  loadMore: () => Promise<void>;
}

const RECONNECT_DELAY_MS = 1_500;

function message(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}

function reconnectDelay(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(resolve, RECONNECT_DELAY_MS);
    signal.addEventListener(
      "abort",
      () => {
        window.clearTimeout(timer);
        resolve();
      },
      { once: true },
    );
  });
}

export function useApplicationRuns(): ApplicationRunsState {
  const [runs, setRuns] = useState<ApplicationRunList | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);
  const [connectionState, setConnectionState] =
    useState<RunEventsConnectionState>("connecting");
  const [streamError, setStreamError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshInFlightRef = useRef(true);
  const requestGenerationRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) {
      return;
    }
    refreshInFlightRef.current = true;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsLoading(true);
    setIsLoadingMore(false);
    setLoadMoreError(null);
    try {
      const next = await fetchApplicationRuns({}, { signal: controller.signal });
      if (
        mountedRef.current &&
        requestGenerationRef.current === generation
      ) {
        setRuns(next);
        setError(null);
      }
    } catch (reason) {
      if (
        mountedRef.current &&
        requestGenerationRef.current === generation
      ) {
        setError(message(reason, "Unable to load application runs"));
      }
    } finally {
      if (
        mountedRef.current &&
        requestGenerationRef.current === generation
      ) {
        setIsLoading(false);
        refreshInFlightRef.current = false;
      }
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (
      !mountedRef.current ||
      refreshInFlightRef.current ||
      runs === null ||
      runs.page >= runs.total_pages ||
      isLoadingMore
    ) {
      return;
    }
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    requestControllerRef.current?.abort();
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setIsLoadingMore(true);
    setLoadMoreError(null);
    try {
      const next = await fetchApplicationRuns(
        {
          page: runs.page + 1,
          page_size: runs.page_size,
        },
        { signal: controller.signal },
      );
      if (
        mountedRef.current &&
        requestGenerationRef.current === generation
      ) {
        const itemsById = new Map(
          runs.items.map((item) => [item.id, item] as const),
        );
        for (const item of next.items) {
          itemsById.set(item.id, item);
        }
        setRuns({
          ...next,
          items: [...itemsById.values()],
        });
      }
    } catch {
      if (
        mountedRef.current &&
        requestGenerationRef.current === generation &&
        !controller.signal.aborted
      ) {
        setLoadMoreError("Unable to load more application runs");
      }
    } finally {
      if (
        mountedRef.current &&
        requestGenerationRef.current === generation
      ) {
        setIsLoadingMore(false);
      }
    }
  }, [isLoadingMore, runs]);

  useEffect(() => {
    mountedRef.current = true;
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    void fetchApplicationRuns({}, { signal: controller.signal })
      .then((next) => {
        if (
          mountedRef.current &&
          requestGenerationRef.current === generation
        ) {
          setRuns(next);
          setError(null);
        }
      })
      .catch((reason: unknown) => {
        if (
          mountedRef.current &&
          requestGenerationRef.current === generation
        ) {
          setError(message(reason, "Unable to load application runs"));
        }
      })
      .finally(() => {
        if (
          mountedRef.current &&
          requestGenerationRef.current === generation
        ) {
          setIsLoading(false);
          refreshInFlightRef.current = false;
        }
      });
    return () => {
      mountedRef.current = false;
      requestControllerRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    let lastEventId: string | undefined;

    const subscribe = async () => {
      while (!controller.signal.aborted) {
        setConnectionState("connecting");
        try {
          lastEventId = await streamApplicationRunEvents({
            lastEventId,
            signal: controller.signal,
            onConnected: () => {
              if (!controller.signal.aborted) {
                setConnectionState("connected");
                setStreamError(null);
              }
            },
            onLastEventId: (nextLastEventId) => {
              lastEventId = nextLastEventId;
            },
            onStateChanging: () => {
              void refresh();
            },
          });
          if (controller.signal.aborted) {
            break;
          }
          setConnectionState("degraded");
          setStreamError("Application run event stream disconnected");
        } catch (reason) {
          if (controller.signal.aborted) {
            break;
          }
          setConnectionState("degraded");
          setStreamError(
            message(reason, "Application run event stream disconnected"),
          );
        }
        await reconnectDelay(controller.signal);
      }
    };

    void subscribe();
    return () => {
      controller.abort();
    };
  }, [refresh]);

  return {
    runs,
    isLoading,
    isLoadingMore,
    error,
    loadMoreError,
    connectionState,
    isStale: connectionState !== "connected",
    streamError,
    hasMore: runs !== null && runs.page < runs.total_pages,
    refresh,
    loadMore,
  };
}
