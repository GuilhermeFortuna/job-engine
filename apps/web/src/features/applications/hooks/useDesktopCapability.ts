"use client";

import { useEffect, useState } from "react";
import {
  getCapabilities,
  type DesktopCapabilities,
} from "../desktop-bridge";

const RETRY_DELAY_MS = 2_000;
const MAX_AUTOMATIC_CHECKS = 3;

export interface DesktopCapabilityState {
  capabilities: DesktopCapabilities | null;
  isLoading: boolean;
  revision: number;
}

export function useDesktopCapability(): DesktopCapabilityState {
  const [state, setState] = useState<DesktopCapabilityState>({
    capabilities: null,
    isLoading: true,
    revision: 0,
  });

  useEffect(() => {
    let cancelled = false;
    let attempts = 0;
    let generation = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;

    const check = async () => {
      const requestGeneration = ++generation;
      attempts += 1;
      const capabilities = await getCapabilities();
      if (cancelled || requestGeneration !== generation) {
        return;
      }
      setState((current) => ({
        capabilities,
        isLoading: false,
        revision: current.revision + 1,
      }));
      if (
        !capabilities.productionRuntime &&
        attempts < MAX_AUTOMATIC_CHECKS
      ) {
        retryTimer = setTimeout(() => {
          if (!cancelled && requestGeneration === generation) {
            void check();
          }
        }, RETRY_DELAY_MS);
      }
    };

    const handleFocus = () => {
      attempts = 0;
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
      }
      void check();
    };

    void check();
    window.addEventListener("focus", handleFocus);
    return () => {
      cancelled = true;
      generation += 1;
      if (retryTimer !== undefined) {
        clearTimeout(retryTimer);
      }
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return state;
}
