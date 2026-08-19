export default function ApplicationWorkspaceLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="application-workspace-loading"
    >
      <span className="sr-only">Loading application workspace...</span>
      <div className="skeleton skeleton-title" />
      <div className="skeleton skeleton-card" />
    </div>
  );
}
