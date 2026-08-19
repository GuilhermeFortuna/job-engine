"use client";

import { useSyncExternalStore, type ReactNode } from "react";

import { GlareHover } from "@/components/ui/glare-hover";
import { MagicCard } from "@/components/ui/magic-card";
import { cn } from "@/lib/utils";

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
  if (!media) {
    return () => {};
  }
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
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

function StaticCard({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card shadow-[var(--shadow-elevated)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function JobCardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
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

  if (!mounted || prefersReducedMotion) {
    return <StaticCard className={className}>{children}</StaticCard>;
  }

  return (
    <div
      className={cn(
        "rounded-xl shadow-[var(--shadow-elevated)]",
        className,
      )}
    >
      <GlareHover
        className="w-full max-w-none cursor-auto rounded-xl"
        width="100%"
        background="transparent"
        color="#ffffff"
        opacity={0.22}
        playOnce
        duration={600}
      >
        <MagicCard
          className="w-full rounded-xl"
          gradientFrom="#3D8BFF"
          gradientTo="#7C5CBF"
          gradientColor="rgba(61, 139, 255, 0.16)"
          gradientOpacity={0.5}
        >
          {children}
        </MagicCard>
      </GlareHover>
    </div>
  );
}
