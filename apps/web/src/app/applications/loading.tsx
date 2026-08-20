export default function ApplicationsLoading() {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className="applications-route-loading"
      role="status"
    >
      <span className="sr-only">Loading applications</span>
      <div className="skeleton applications-skeleton-heading" />
      <div className="skeleton applications-skeleton-panel" />
      <div className="skeleton applications-skeleton-panel" />
    </div>
  );
}
