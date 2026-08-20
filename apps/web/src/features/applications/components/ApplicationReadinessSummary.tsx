"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  getCapabilities,
  isProductionRuntimeReady,
} from "../desktop-bridge";
import { useApplicationReadiness } from "../hooks/useApplicationReadiness";

type RuntimeAvailability = "checking" | "available" | "unavailable";

export function ApplicationReadinessSummary() {
  const readiness = useApplicationReadiness();
  const [runtimeAvailability, setRuntimeAvailability] =
    useState<RuntimeAvailability>("checking");

  useEffect(() => {
    let disposed = false;
    void getCapabilities().then((capabilities) => {
      if (!disposed) {
        setRuntimeAvailability(
          isProductionRuntimeReady(capabilities) ? "available" : "unavailable",
        );
      }
    });
    return () => {
      disposed = true;
    };
  }, []);

  return (
    <section
      aria-labelledby="application-readiness-heading"
      className="applications-readiness"
    >
      <div className="applications-section-heading">
        <div>
          <h2 id="application-readiness-heading">Application readiness</h2>
          <p>Prepare the minimum information needed for assisted applications.</p>
        </div>
        <Link className="btn btn-secondary" href="/applications/settings">
          Application settings
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

      <ul className="applications-readiness-list">
        <li data-ready={readiness.profile !== null}>
          <span aria-hidden="true">{readiness.profile ? "✓" : "!"}</span>
          {readiness.profile ? "Profile complete" : "Profile setup required"}
        </li>
        <li data-ready={readiness.resumes.length > 0}>
          <span aria-hidden="true">{readiness.resumes.length > 0 ? "✓" : "!"}</span>
          {readiness.resumes.length > 0
            ? `${readiness.resumes.length} registered résumé${readiness.resumes.length === 1 ? "" : "s"}`
            : "Résumé registration required"}
        </li>
        <li data-ready={runtimeAvailability === "available"}>
          <span aria-hidden="true">
            {runtimeAvailability === "available" ? "✓" : "!"}
          </span>
          {runtimeAvailability === "checking"
            ? "Checking production runtime"
            : runtimeAvailability === "available"
              ? "Production runtime available"
              : "Open the desktop app to use the production runtime"}
        </li>
      </ul>
    </section>
  );
}
