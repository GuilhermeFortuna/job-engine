export default function JobsLoading() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-live="polite"
      className="jobs-loading-container"
    >
      <span className="sr-only">Loading job opportunities...</span>
      <div className="jobs-loading-header">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-subtitle" />
      </div>

      <div className="jobs-loading-layout">
        <div className="jobs-loading-sidebar">
          <div className="skeleton skeleton-filter-box" />
        </div>

        <div className="jobs-loading-results">
          <div className="skeleton skeleton-status" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
          <div className="skeleton skeleton-card" />
        </div>
      </div>
    </div>
  );
}
