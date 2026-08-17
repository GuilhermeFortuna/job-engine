export function SearchStatus({
  total,
  page,
  pageSize,
}: {
  total: number;
  page: number;
  pageSize: number;
}) {
  let statusText = "0 jobs found";

  if (total > 0) {
    const start = (page - 1) * pageSize + 1;
    const end = Math.min(page * pageSize, total);
    if (start > total) {
      statusText = `Page ${page} is beyond available results (${total} total jobs)`;
    } else {
      statusText = `Showing ${start}–${end} of ${total} jobs`;
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className="search-status"
    >
      <p className="search-status-text">{statusText}</p>
    </div>
  );
}
