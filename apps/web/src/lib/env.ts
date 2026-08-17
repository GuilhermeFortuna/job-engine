const DEFAULT_DEV_API_BASE_URL = "http://127.0.0.1:8000";

export function getApiBaseUrl(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const raw = env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const value =
    raw && raw.length > 0
      ? raw
      : env.NODE_ENV === "development"
        ? DEFAULT_DEV_API_BASE_URL
        : undefined;

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
