import type { ReactNode } from "react";

import { ShimmerAnchor } from "@/components/ui/shimmer-button";

export interface ExternalApplyLinkProps {
  url?: string | null;
  sourceName?: string;
  className?: string;
  children?: ReactNode;
  fallback?: ReactNode;
}

export function isValidHttpUrl(urlStr: string | null | undefined): boolean {
  if (!urlStr || typeof urlStr !== "string") {
    return false;
  }
  const trimmed = urlStr.trim();
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    return false;
  }
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function ExternalApplyLink({
  url,
  sourceName,
  className,
  children,
  fallback,
}: ExternalApplyLinkProps) {
  if (!url || !isValidHttpUrl(url)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return (
      <span
        className="inline-flex items-center rounded-lg border border-dashed border-border bg-muted px-4 py-2 text-sm font-medium text-muted-foreground"
        aria-disabled="true"
      >
        Application link unavailable
      </span>
    );
  }

  const defaultLabel = sourceName ? `Apply on ${sourceName}` : "Apply on external site";

  return (
    <ShimmerAnchor
      href={url.trim()}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children || defaultLabel}{" "}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in new tab)</span>
    </ShimmerAnchor>
  );
}
