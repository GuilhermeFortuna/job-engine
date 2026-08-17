import type { ReactNode } from "react";

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
  className = "btn btn-apply",
  children,
  fallback,
}: ExternalApplyLinkProps) {
  if (!url || !isValidHttpUrl(url)) {
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }
    return (
      <span className="apply-link-unavailable" aria-disabled="true">
        Application link unavailable
      </span>
    );
  }

  const defaultLabel = sourceName ? `Apply on ${sourceName}` : "Apply on external site";

  return (
    <a
      href={url.trim()}
      target="_blank"
      rel="noopener noreferrer"
      className={className}
    >
      {children || defaultLabel}{" "}
      <span aria-hidden="true">↗</span>
      <span className="sr-only"> (opens in new tab)</span>
    </a>
  );
}
