"use client";

import { useSyncExternalStore } from "react";
import { useTheme } from "next-themes";

import { AnimatedThemeToggler } from "@/components/ui/animated-theme-toggler";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function subscribeReducedMotion(onStoreChange: () => void) {
  const media = window.matchMedia("(prefers-reduced-motion: reduce)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

function getReducedMotionSnapshot() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getDisabledSnapshot() {
  return false;
}

function subscribeHydrated() {
  return () => {};
}

function getHydratedSnapshot() {
  return true;
}

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const hydrated = useSyncExternalStore(
    subscribeHydrated,
    getHydratedSnapshot,
    getDisabledSnapshot,
  );
  const prefersReducedMotion = useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getDisabledSnapshot,
  );

  const chromeClassName = cn(
    buttonVariants({ variant: "outline", size: "icon" }),
    "shrink-0",
  );

  if (!hydrated) {
    return (
      <span className={chromeClassName} aria-hidden="true">
        <span className="size-4" />
      </span>
    );
  }

  return (
    <AnimatedThemeToggler
      className={chromeClassName}
      theme={resolvedTheme === "dark" ? "dark" : "light"}
      onThemeChange={setTheme}
      variant="circle"
      duration={prefersReducedMotion ? 0 : 400}
    />
  );
}
