import { BlockedNavigationReason } from "../shared/contracts";
import { isLoopbackOrigin } from "./config";

export interface NavigationValidationResult {
  allowed: boolean;
  reason: BlockedNavigationReason | null;
  sanitizedUrl: string;
}

export function sanitizeDisplayUrl(rawUrl: string): string {
  if (!rawUrl) return "";
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return "";
    }
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return "";
  }
}

export function validateNavigationUrl(
  rawUrl: string,
  isTest: boolean = false
): NavigationValidationResult {
  if (!rawUrl || typeof rawUrl !== "string") {
    return {
      allowed: false,
      reason: "UNAPPROVED_NAVIGATION",
      sanitizedUrl: "",
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      allowed: false,
      reason: "UNAPPROVED_NAVIGATION",
      sanitizedUrl: "",
    };
  }

  // Reject dangerous schemes
  const disallowedProtocols = [
    "file:",
    "data:",
    "javascript:",
    "vbscript:",
    "about:",
    "chrome:",
    "electron:",
    "devtools:",
    "blob:",
    "mailto:",
    "tel:",
    "sms:",
    "slack:",
    "zoommtg:",
  ];

  if (disallowedProtocols.includes(parsed.protocol.toLowerCase())) {
    return {
      allowed: false,
      reason: "NON_HTTPS_DENIED",
      sanitizedUrl: "",
    };
  }

  // Enforce HTTPS
  if (parsed.protocol === "https:") {
    return {
      allowed: true,
      reason: null,
      sanitizedUrl: sanitizeDisplayUrl(rawUrl),
    };
  }

  // In test mode, allow loopback HTTP for synthetic test fixtures
  if (isTest && parsed.protocol === "http:" && isLoopbackOrigin(rawUrl)) {
    return {
      allowed: true,
      reason: null,
      sanitizedUrl: sanitizeDisplayUrl(rawUrl),
    };
  }

  // Non-HTTPS remote URL is strictly denied
  return {
    allowed: false,
    reason: "NON_HTTPS_DENIED",
    sanitizedUrl: sanitizeDisplayUrl(rawUrl),
  };
}
