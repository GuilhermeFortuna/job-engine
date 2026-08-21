"use client";

import Link from "next/link";
import { useApplicationReadiness } from "../hooks/useApplicationReadiness";

export function ApplicationReadinessSummary() {
  const readiness = useApplicationReadiness();

  return (
    <section
      aria-labelledby="application-readiness-heading"
      className="applications-readiness"
    >
      <div className="applications-section-heading">
        <div>
          <h2 id="application-readiness-heading">Application readiness</h2>
          <p>Prepare the applicant profile needed for assisted applications.</p>
        </div>
        <Link className="btn btn-secondary" href="/profile">
          Open Profile
        </Link>
      </div>

      {readiness.isLoading ? (
        <p aria-live="polite" role="status">
          Checking application readiness
        </p>
      ) : null}
      {readiness.error ? (
        <p role="alert">Unable to check application readiness.</p>
      ) : null}

      <p
        className="applications-readiness-label"
        data-label={readiness.readinessLabel}
        role="status"
      >
        {readiness.readinessLabel}
      </p>

      <ul className="applications-readiness-list">
        {readiness.productReadiness.blockers.map((item) => (
          <li key={item} data-ready="false">
            <span aria-hidden="true">!</span>
            {item}
          </li>
        ))}
        {readiness.productReadiness.exceptions.map((item) => (
          <li key={item} data-ready="partial">
            <span aria-hidden="true">~</span>
            {item}
          </li>
        ))}
        {readiness.productReadiness.blockers.length === 0 &&
        readiness.productReadiness.exceptions.length === 0 &&
        !readiness.isLoading ? (
          <li data-ready="true">
            <span aria-hidden="true">✓</span>
            Profile, resume, desktop runtime, and local AI checks passed
          </li>
        ) : null}
      </ul>
    </section>
  );
}
