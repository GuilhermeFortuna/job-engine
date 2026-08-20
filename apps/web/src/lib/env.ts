const DEFAULT_DEV_API_BASE_URL = "http://127.0.0.1:8001";

export function getApiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const raw = env.NEXT_PUBLIC_API_BASE_URL?.trim();
  let value: string | undefined;

  if (raw && raw.length > 0) {
    value = raw;
  } else if (env.NODE_ENV === "development") {
    value = DEFAULT_DEV_API_BASE_URL;
  } else if (typeof window !== "undefined" && env === process.env) {
    // In-browser client fallback
    value =
      window.location.port === "3005"
        ? "http://127.0.0.1:8088"
        : DEFAULT_DEV_API_BASE_URL;
  }

  if (!value) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is required outside local development",
    );
  }

  return assertPublicHttpOrigin(value);
}

function assertPublicHttpOrigin(value: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must be a valid URL");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must use http or https");
  }

  if (url.username || url.password) {
    throw new Error("NEXT_PUBLIC_API_BASE_URL must not contain credentials");
  }

  return value.replace(/\/$/, "");
}
