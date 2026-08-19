import type { NextConfig } from "next";

function getDevOrigins(): string[] {
  const origins = new Set<string>(["localhost", "127.0.0.1", "[::1]"]);

  for (const envVar of [
    process.env.JOB_ENGINE_WEB_ORIGIN,
    process.env.JOB_ENGINE_FRONTEND_ORIGIN,
    process.env.NEXT_ALLOWED_DEV_ORIGINS,
  ]) {
    if (!envVar) continue;
    for (const item of envVar.split(",")) {
      const trimmed = item.trim();
      if (!trimmed) continue;
      try {
        const url = new URL(trimmed.includes("://") ? trimmed : `http://${trimmed}`);
        origins.add(url.hostname);
        if (url.port) {
          origins.add(`${url.hostname}:${url.port}`);
        }
      } catch {
        origins.add(trimmed);
      }
    }
  }

  return Array.from(origins);
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  agentRules: false,
  allowedDevOrigins: getDevOrigins(),
};

export default nextConfig;
