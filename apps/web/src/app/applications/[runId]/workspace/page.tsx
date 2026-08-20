import type { Metadata } from "next";
import { ApplicationWorkspace } from "@/features/applications/components/ApplicationWorkspace";
import { parseLaunchOutcome } from "@/features/applications/launch-outcome";

interface WorkspacePageProps {
  params: Promise<{ runId: string }>;
  searchParams?: Promise<{ launch?: string | string[] }>;
}

export const dynamic = "force-dynamic";

export async function generateMetadata(
  props: WorkspacePageProps,
): Promise<Metadata> {
  const { runId } = await props.params;
  return {
    title: `Application workspace ${runId} - Job Engine`,
    description: "Embedded assisted application workspace.",
  };
}

export default async function ApplicationWorkspacePage(props: WorkspacePageProps) {
  const { runId } = await props.params;
  const searchParams = await props.searchParams;
  return (
    <ApplicationWorkspace
      runId={runId}
      launchOutcome={parseLaunchOutcome(searchParams?.launch)}
    />
  );
}
