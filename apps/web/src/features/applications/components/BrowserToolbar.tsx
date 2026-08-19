import type { DesktopBrowserState } from "../desktop-bridge";

export interface BrowserToolbarProps {
  desktopAvailable: boolean;
  browserState: DesktopBrowserState;
  onBack: () => void;
  onForward: () => void;
  onReload: () => void;
}

const BLOCKED_LABELS: Record<string, string> = {
  NON_HTTPS_DENIED: "Navigation blocked: HTTPS is required.",
  UNAPPROVED_NAVIGATION: "Navigation blocked: destination is not allowed.",
  UNAPPROVED_POPUP: "Popup blocked.",
  DOWNLOAD_DENIED: "Download blocked.",
  CRASHED: "The embedded page crashed.",
  LOAD_FAILED: "The embedded page failed to load.",
  UNRESOLVED_RUN: "The application run could not be opened.",
};

export function BrowserToolbar({
  desktopAvailable,
  browserState,
  onBack,
  onForward,
  onReload,
}: BrowserToolbarProps) {
  const status = !desktopAvailable
    ? "Desktop unavailable. Open this workspace from the Job Engine desktop app."
    : browserState.isLoading
      ? "Loading embedded application page"
      : browserState.displayUrl || "Embedded application ready";

  return (
    <div className="browser-toolbar">
      <div className="browser-toolbar-controls">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
          disabled={!desktopAvailable || !browserState.canGoBack}
        >
          Back
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onForward}
          disabled={!desktopAvailable || !browserState.canGoForward}
        >
          Forward
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={onReload}
          disabled={!desktopAvailable}
        >
          Reload
        </button>
      </div>
      <p className="browser-toolbar-url">{browserState.displayUrl || "No page open"}</p>
      <p className="sr-only" role="status" aria-live="polite">
        {status}
      </p>
      {browserState.blockedNavigationReason ? (
        <p className="browser-toolbar-blocked" role="alert">
          {BLOCKED_LABELS[browserState.blockedNavigationReason] ??
            "Navigation blocked."}
        </p>
      ) : null}
    </div>
  );
}
