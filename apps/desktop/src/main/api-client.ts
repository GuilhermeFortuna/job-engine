export interface ResolvedApplicationRun {
  runId: string;
  applicationUrl: string;
  canonicalApplicationUrl: string;
  platformAdapterId: string;
  status: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUuid(id: string): boolean {
  return typeof id === "string" && UUID_REGEX.test(id);
}

export async function fetchApplicationRun(
  apiBaseUrl: string,
  runId: string,
  runnerSecret?: string
): Promise<ResolvedApplicationRun> {
  if (!isValidUuid(runId)) {
    throw new Error(`Invalid runId format: must be a valid UUID, got "${runId}"`);
  }

  const endpoint = `${apiBaseUrl}/api/v1/application-runs/${runId}`;
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (runnerSecret) {
    headers["Authorization"] = `Bearer ${runnerSecret}`;
  }

  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "GET",
      headers,
    });
  } catch (err) {
    throw new Error(
      `Failed to reach API endpoint ${endpoint}: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Application run not found: ${runId}`);
    }
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `API returned HTTP ${response.status} for run ${runId}: ${errorBody}`
    );
  }

  const data = (await response.json()) as Record<string, any>;
  const resolvedAppUrl = data.application_url || data.canonical_application_url;

  if (!resolvedAppUrl || typeof resolvedAppUrl !== "string") {
    throw new Error(
      `Application run ${runId} does not contain a valid application_url`
    );
  }

  return {
    runId: String(data.id || runId),
    applicationUrl: resolvedAppUrl,
    canonicalApplicationUrl: String(data.canonical_application_url || resolvedAppUrl),
    platformAdapterId: String(data.platform_adapter_id || ""),
    status: String(data.status || ""),
  };
}
