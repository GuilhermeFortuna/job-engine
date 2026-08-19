"use client";

import { useTheme } from "next-themes";
import { useSyncExternalStore } from "react";

import { Aurora } from "@/components/ui/aurora";
import { Silk } from "@/components/ui/silk";

const DARK_AURORA = ["#3D8BFF", "#7C5CBF", "#1B4F8A"];
const LIGHT_AURORA = ["#8BB6FF", "#C4B5E8", "#6EA8FF"];

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function subscribeHydrated() {
  return () => {};
}

function getHydratedSnapshot() {
  return true;
}

function getServerSnapshot() {
  return false;
}

export function CatalogBackdrop() {
  const { resolvedTheme } = useTheme();
  const mounted = useSyncExternalStore(
    subscribeHydrated,
    getHydratedSnapshot,
    getServerSnapshot,
  );
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getServerSnapshot,
  );

  const isDark = resolvedTheme !== "light";
  const showWebGl = mounted && !prefersReducedMotion;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      {showWebGl ? (
        <>
          <div className="absolute inset-0">
            <Silk
              color={isDark ? "#121214" : "#d5d8e0"}
              speed={0.28}
              scale={0.72}
              noiseIntensity={0}
              rotation={-0.08}
            />
          </div>
          <div
            className={
              isDark
                ? "absolute inset-x-0 top-0 h-[72%] opacity-55 mix-blend-screen"
                : "absolute inset-x-0 top-0 h-[72%] opacity-35 mix-blend-multiply"
            }
          >
            <Aurora
              colorStops={isDark ? DARK_AURORA : LIGHT_AURORA}
              amplitude={0.42}
              blend={0.7}
              speed={0.38}
            />
          </div>
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-b from-ring/25 via-transparent to-background" />
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-background/10 via-background/25 to-background/75" />
    </div>
  );
}
