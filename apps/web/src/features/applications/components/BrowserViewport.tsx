"use client";

import { useEffect, useRef } from "react";
import {
  isSupportedWorkspaceSize,
  measureViewportBounds,
  type ApplicationBounds,
} from "../desktop-bridge";

export interface BrowserViewportProps {
  onBounds: (bounds: ApplicationBounds | null) => void;
  onSupportedChange: (supported: boolean) => void;
  viewSurrendered?: boolean;
}

function currentSupported(): boolean {
  return isSupportedWorkspaceSize(window.innerWidth, window.innerHeight);
}

export function BrowserViewport({
  onBounds,
  onSupportedChange,
  viewSurrendered = false,
}: BrowserViewportProps) {
  const frameRef = useRef<HTMLDivElement>(null);
  const onBoundsRef = useRef(onBounds);
  const onSupportedRef = useRef(onSupportedChange);

  useEffect(() => {
    onBoundsRef.current = onBounds;
    onSupportedRef.current = onSupportedChange;
  });

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }
    let cancelled = false;

    const report = () => {
      if (cancelled) {
        return;
      }
      const supported = currentSupported();
      onSupportedRef.current(supported);
      if (!supported) {
        onBoundsRef.current(null);
        return;
      }
      onBoundsRef.current(measureViewportBounds(frame));
    };

    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(() => report())
        : null;
    observer?.observe(frame);
    window.addEventListener("resize", report);
    window.addEventListener("scroll", report, true);
    window.visualViewport?.addEventListener("resize", report);
    window.visualViewport?.addEventListener("scroll", report);
    const media = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`);
    media.addEventListener?.("change", report);
    report();

    return () => {
      cancelled = true;
      observer?.disconnect();
      window.removeEventListener("resize", report);
      window.removeEventListener("scroll", report, true);
      window.visualViewport?.removeEventListener("resize", report);
      window.visualViewport?.removeEventListener("scroll", report);
      media.removeEventListener?.("change", report);
    };
  }, []);

  return (
    <div
      ref={frameRef}
      className="browser-viewport"
      data-testid="browser-viewport"
      aria-hidden={viewSurrendered ? undefined : true}
    >
      {viewSurrendered ? (
        <p role="status">
          View surrendered by the coordinator while this run is paused for a
          trusted owner action.
        </p>
      ) : null}
    </div>
  );
}
