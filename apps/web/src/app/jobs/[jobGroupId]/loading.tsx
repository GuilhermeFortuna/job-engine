export default function JobDetailLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="job-details-loading-container"
    >
      <span className="sr-only">Loading job details...</span>
      <div className="skeleton skeleton-nav" />

      <div className="job-details-loading-header">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
        <div className="skeleton skeleton-badges" />
      </div>

      <div className="skeleton skeleton-summary-box" />
      <div className="skeleton skeleton-desc-box" />
      <div className="skeleton skeleton-provenance-box" />
    </div>
  );
}
