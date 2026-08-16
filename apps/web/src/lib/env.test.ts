import { describe, expect, it } from "vitest";
import { getApiBaseUrl } from "@/lib/env";

const developmentEnv = {
  NODE_ENV: "development",
} as NodeJS.ProcessEnv;

describe("getApiBaseUrl", () => {
  it("defaults to the local backend origin in development when unset", () => {
    expect(getApiBaseUrl(developmentEnv)).toBe("http://127.0.0.1:8000");
  });

  it("defaults to the local backend origin in development when empty", () => {
    expect(
      getApiBaseUrl({ ...developmentEnv, NEXT_PUBLIC_API_BASE_URL: "" }),
    ).toBe("http://127.0.0.1:8000");
  });

  it("requires NEXT_PUBLIC_API_BASE_URL outside local development", () => {
    expect(() =>
      getApiBaseUrl({ NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toThrow(/NEXT_PUBLIC_API_BASE_URL is required outside local development/);
  });

  it("returns a configured http origin without a trailing slash", () => {
    expect(
      getApiBaseUrl({
        NODE_ENV: "production",
        NEXT_PUBLIC_API_BASE_URL: "https://api.example.test/v1/",
      } as NodeJS.ProcessEnv),
    ).toBe("https://api.example.test/v1");
  });

  it("rejects credentials in the public URL", () => {
    expect(() =>
      getApiBaseUrl({
        NODE_ENV: "development",
        NEXT_PUBLIC_API_BASE_URL: "http://user:secret@127.0.0.1:8000",
      } as NodeJS.ProcessEnv),
    ).toThrow(/must not contain credentials/);
  });

  it("rejects non-http protocols", () => {
    expect(() =>
      getApiBaseUrl({
        NODE_ENV: "development",
        NEXT_PUBLIC_API_BASE_URL: "ftp://127.0.0.1:8000",
      } as NodeJS.ProcessEnv),
    ).toThrow(/must use http or https/);
  });

  it("rejects invalid URLs", () => {
    expect(() =>
      getApiBaseUrl({
        NODE_ENV: "development",
        NEXT_PUBLIC_API_BASE_URL: "not a url",
      } as NodeJS.ProcessEnv),
    ).toThrow(/must be a valid URL/);
  });
});
