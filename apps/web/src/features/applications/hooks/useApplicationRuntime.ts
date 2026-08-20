"use client";

import { useEffect, useState } from "react";
import {
  getRuntimeState,
  subscribeRuntimeState,
  type DesktopRuntimeState,
} from "../desktop-bridge";
import { applyRuntimeState } from "../projections";

export interface ApplicationRuntimeState {
  runtimeState: DesktopRuntimeState | null;
  viewAttached: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface ApplicationRuntimeSnapshotState {
  runtimeState: DesktopRuntimeState | null;
  isLoading: boolean;
  error: string | null;
}

export function useApplicationRuntimeSnapshot(): ApplicationRuntimeSnapshotState {
  const [snapshot, setSnapshot] = useState<ApplicationRuntimeSnapshotState>({
    runtimeState: null,
    isLoading: true,
    error: null,
  });

  useEffect(() => {
    let disposed = false;
    let subscriptionRevision = 0;

    const apply = (next: DesktopRuntimeState) => {
      setSnapshot({
        runtimeState: next,
        isLoading: false,
        error: null,
      });
    };
    const revisionAtFetch = subscriptionRevision;
    const initialState = getRuntimeState();
    const unsubscribe = subscribeRuntimeState((next) => {
      if (disposed) {
        return;
      }
      subscriptionRevision += 1;
      apply(next);
    });

    void initialState
      .then((next) => {
        if (!disposed && subscriptionRevision === revisionAtFetch) {
          apply(next);
        }
      })
      .catch(() => {
        if (!disposed && subscriptionRevision === revisionAtFetch) {
          setSnapshot({
            runtimeState: null,
            isLoading: false,
            error: "Unable to load runtime state.",
          });
        }
      });

    return () => {
      disposed = true;
      unsubscribe();
    };
  }, []);

  return snapshot;
}

export function useApplicationRuntime(
  runId: string,
): ApplicationRuntimeState {
  const snapshot = useApplicationRuntimeSnapshot();
  const projected =
    snapshot.runtimeState === null
      ? { runtimeState: null, viewAttached: false }
      : applyRuntimeState({ id: runId }, snapshot.runtimeState);

  return {
    runtimeState: projected.runtimeState,
    viewAttached: projected.viewAttached,
    isLoading: snapshot.isLoading,
    error: snapshot.error,
  };
}
