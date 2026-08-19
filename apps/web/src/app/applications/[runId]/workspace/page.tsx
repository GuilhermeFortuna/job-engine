import type { Metadata } from "next";
import { ApplicationWorkspace } from "@/features/applications/components/ApplicationWorkspace";

interface WorkspacePageProps {
  params: Promise<{ runId: string }>;
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
  return <ApplicationWorkspace runId={runId} />;
}
