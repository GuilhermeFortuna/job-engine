import Link from "next/link";
import { ApplicationSettings } from "@/features/applications/components/ApplicationSettings";

export default function ApplicationSettingsPage() {
  return (
    <div className="applications-page application-settings-page">
      <header className="applications-page-header">
        <div>
          <p><Link href="/applications">← Applications</Link></p>
          <h1>Application settings</h1>
          <p>
            Manage the applicant profile, local résumé catalog, and private
            reusable answers used by application automation.
          </p>
        </div>
      </header>
      <ApplicationSettings />
    </div>
  );
}
