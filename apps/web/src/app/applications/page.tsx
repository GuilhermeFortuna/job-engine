import { ApplicationReadinessSummary } from "@/features/applications/components/ApplicationReadinessSummary";
import { ApplicationsControlCenter } from "@/features/applications/components/ApplicationsControlCenter";

export default function ApplicationsPage() {
  return (
    <div className="applications-page">
      <header className="applications-page-header">
        <h1>Applications</h1>
        <p>
          Review readiness, live progress, attention items, and durable outcomes.
        </p>
      </header>
      <ApplicationReadinessSummary />
      <ApplicationsControlCenter />
    </div>
  );
}
