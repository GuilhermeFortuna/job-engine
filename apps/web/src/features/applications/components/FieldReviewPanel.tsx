import { countFieldReports, type SafeFieldReport } from "../types";

export interface FieldReviewPanelProps {
  reports: SafeFieldReport[];
}

export function FieldReviewPanel({ reports }: FieldReviewPanelProps) {
  const counts = countFieldReports(reports);
  return (
    <section className="field-review-panel" aria-labelledby="field-review-heading">
      <h2 id="field-review-heading">Field review</h2>
      <p className="field-review-counts">
        Filled {counts.filled}. Review {counts.review}. Unresolved {counts.unresolved}.
      </p>
      {reports.length === 0 ? (
        <p>No field reports yet.</p>
      ) : (
        <ul className="field-review-list">
          {reports.map((report) => (
            <li key={report.field_fingerprint}>
              <p>
                <strong>{report.label}</strong>
                {report.required ? " (required)" : ""}
              </p>
              <p>Status: {report.status.replaceAll("_", " ")}</p>
              {report.reason_code ? <p>Reason: {report.reason_code}</p> : null}
              {report.question_intent ? (
                <p>Intent: {report.question_intent.replaceAll("_", " ")}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
