import os from "node:os";
import path from "node:path";

export interface DesktopConfig {
  webOrigin: string;
  apiBaseUrl: string;
  sessionPartition: string;
  userDataDir: string;
  runnerSecret: string;
  isTest: boolean;
}

export function isLoopbackOrigin(urlStr: string): boolean {
  try {
    const url = new URL(urlStr);
    const host = url.hostname.toLowerCase();
    const isLoopbackHost =
      host === "127.0.0.1" ||
      host === "localhost" ||
      host === "::1" ||
      host === "[::1]";
    return (
      isLoopbackHost && (url.protocol === "http:" || url.protocol === "https:")
    );
  } catch {
    return false;
  }
}

export function loadDesktopConfig(
  env: NodeJS.ProcessEnv = process.env,
): DesktopConfig {
  const rawWebOrigin = env.JOB_ENGINE_WEB_ORIGIN || "http://127.0.0.1:3000";
  if (!isLoopbackOrigin(rawWebOrigin)) {
    throw new Error(
      `JOB_ENGINE_WEB_ORIGIN must be a valid loopback origin (http://127.0.0.1:* or http://localhost:*), got: ${rawWebOrigin}`,
    );
  }
  const webOrigin = new URL(rawWebOrigin).origin;

  const rawApiBaseUrl =
    env.JOB_ENGINE_API_BASE_URL ||
    env.NEXT_PUBLIC_API_BASE_URL ||
    "http://127.0.0.1:8001";
  if (!isLoopbackOrigin(rawApiBaseUrl)) {
    throw new Error(
      `JOB_ENGINE_API_BASE_URL must be a valid loopback origin, got: ${rawApiBaseUrl}`,
    );
  }
  const apiBaseUrl = new URL(rawApiBaseUrl).origin;

  const defaultUserDataDir = path.join(
    os.homedir(),
    ".job-engine",
    "desktop-data",
  );
  const userDataDir = env.JOB_ENGINE_DESKTOP_USER_DATA_DIR
    ? path.resolve(env.JOB_ENGINE_DESKTOP_USER_DATA_DIR)
    : defaultUserDataDir;

  const sessionPartition =
    env.JOB_ENGINE_SESSION_PARTITION || "persist:job-engine-ats";
  const runnerSecret = env.JOB_ENGINE_RUNNER_SECRET || "";
  const isTest = env.NODE_ENV === "test";

  return {
    webOrigin,
    apiBaseUrl,
    sessionPartition,
    userDataDir,
    runnerSecret,
    isTest,
  };
}
