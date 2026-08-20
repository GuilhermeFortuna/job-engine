import { workspacePath } from "./types";

export const DESKTOP_OPEN_REQUESTED = "desktop_open_requested" as const;
export const DESKTOP_OPEN_UNAVAILABLE = "desktop_open_unavailable" as const;

export type LaunchOutcome =
  | typeof DESKTOP_OPEN_REQUESTED
  | typeof DESKTOP_OPEN_UNAVAILABLE;

export function parseLaunchOutcome(
  value: string | string[] | undefined,
): LaunchOutcome | null {
  if (value === DESKTOP_OPEN_REQUESTED) {
    return DESKTOP_OPEN_REQUESTED;
  }
  if (value === DESKTOP_OPEN_UNAVAILABLE) {
    return DESKTOP_OPEN_UNAVAILABLE;
  }
  return null;
}

export function workspaceLaunchPath(
  runId: string,
  outcome: LaunchOutcome,
): string {
  const query = new URLSearchParams({ launch: outcome });
  return `${workspacePath(runId)}?${query.toString()}`;
}
