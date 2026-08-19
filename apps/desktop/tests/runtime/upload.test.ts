import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";

import {
  attachResumeToFileInput,
  cleanupAllTempFiles,
  trackedTempDirs,
  UploadError,
} from "../../src/main/forms/upload";
import type { IsolatedWorldSession } from "../../src/main/forms/isolated-world";

const PDF = Buffer.from("%PDF-1.4 synthetic resume bytes");

interface Recorder {
  session: IsolatedWorldSession;
  sentPaths: string[];
  released: string[];
  /** Directory the file lived in, captured while the upload was in flight. */
  observedDir: string | null;
  observedMode: number | null;
  observedDirMode: number | null;
  observedBytes: Buffer | null;
}

function makeSession(
  overrides: {
    objectId?: string | null;
    onSetFiles?: (params: Record<string, unknown>) => void;
  } = {},
): Recorder {
  const recorder: Recorder = {
    session: null as unknown as IsolatedWorldSession,
    sentPaths: [],
    released: [],
    observedDir: null,
    observedMode: null,
    observedDirMode: null,
    observedBytes: null,
  };

  const session = {
    callForObjectId: vi.fn(async () =>
      overrides.objectId === undefined ? "OBJ-1" : overrides.objectId,
    ),
    send: vi.fn(async (method: string, params?: Record<string, unknown>) => {
      if (method === "DOM.setFileInputFiles" && params) {
        const files = params.files as string[];
        recorder.sentPaths.push(...files);
        // Inspect the file exactly while the renderer would read it.
        const path = files[0];
        recorder.observedDir = path.slice(0, path.lastIndexOf("/"));
        recorder.observedMode = statSync(path).mode & 0o777;
        recorder.observedDirMode =
          statSync(recorder.observedDir).mode & 0o777;
        recorder.observedBytes = readFileSync(path);
        overrides.onSetFiles?.(params);
      }
      return {};
    }),
    releaseObject: vi.fn(async (objectId: string) => {
      recorder.released.push(objectId);
    }),
  } as unknown as IsolatedWorldSession;

  recorder.session = session;
  return recorder;
}

describe("resume attachment", () => {
  it("hands CDP the file by object id, never a selector", async () => {
    const recorder = makeSession();
    const result = await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    });

    expect(result).toEqual({ attached: true, reason: "ATTACHED" });
    expect(recorder.session.send).toHaveBeenCalledWith(
      "DOM.setFileInputFiles",
      expect.objectContaining({ objectId: "OBJ-1" }),
    );
  });

  it("writes the verified bytes with owner-only permissions", async () => {
    const recorder = makeSession();
    await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    });

    expect(recorder.observedBytes?.equals(PDF)).toBe(true);
    expect(recorder.observedMode).toBe(0o600);
    // Captured while the file existed; by now it is already gone.
    expect(recorder.observedDirMode).toBe(0o700);
  });

  it("uses a non-user-derived filename under the OS temp root", async () => {
    const recorder = makeSession();
    await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    });

    const path = recorder.sentPaths[0];
    expect(path.startsWith(tmpdir())).toBe(true);
    expect(path).toMatch(/\/[0-9a-f]{32}\.pdf$/);
    // Nothing identifying may appear in a path other processes can list.
    expect(path).not.toContain("resume.pdf");
    expect(path).not.toContain("key");
  });

  it("reports a missing file control without touching disk", async () => {
    const recorder = makeSession({ objectId: null });
    const result = await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    });

    expect(result).toEqual({ attached: false, reason: "NO_FILE_INPUT" });
    expect(recorder.session.send).not.toHaveBeenCalled();
    expect(trackedTempDirs()).toEqual([]);
  });
});

describe("temporary file lifecycle", () => {
  it("removes the file after a successful upload", async () => {
    const recorder = makeSession();
    await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    });

    expect(existsSync(recorder.sentPaths[0])).toBe(false);
    expect(existsSync(recorder.observedDir!)).toBe(false);
    expect(trackedTempDirs()).toEqual([]);
  });

  it("removes the file when the page rejects the upload", async () => {
    const recorder = makeSession({
      onSetFiles: () => {
        throw new Error("File type not allowed");
      },
    });

    await expect(
      attachResumeToFileInput({
        session: recorder.session,
        semanticKey: "key",
        bytes: PDF,
      }),
    ).rejects.toThrow(UploadError);

    expect(existsSync(recorder.observedDir!)).toBe(false);
    expect(trackedTempDirs()).toEqual([]);
  });

  it("removes the file when the renderer crashes mid-upload", async () => {
    const recorder = makeSession({
      onSetFiles: () => {
        throw new Error("Target closed: render process gone");
      },
    });

    await expect(
      attachResumeToFileInput({
        session: recorder.session,
        semanticKey: "key",
        bytes: PDF,
      }),
    ).rejects.toThrow(UploadError);
    expect(existsSync(recorder.observedDir!)).toBe(false);
  });

  it("releases the remote object reference on every path", async () => {
    const ok = makeSession();
    await attachResumeToFileInput({
      session: ok.session,
      semanticKey: "key",
      bytes: PDF,
    });
    expect(ok.released).toEqual(["OBJ-1"]);

    const failing = makeSession({
      onSetFiles: () => {
        throw new Error("boom");
      },
    });
    await expect(
      attachResumeToFileInput({
        session: failing.session,
        semanticKey: "key",
        bytes: PDF,
      }),
    ).rejects.toThrow();
    expect(failing.released).toEqual(["OBJ-1"]);
  });

  it("leaves no resume directory behind in the OS temp root", async () => {
    const recorder = makeSession();
    await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    });

    const leftovers = readdirSync(tmpdir()).filter((entry) =>
      entry.startsWith("job-engine-resume-"),
    );
    expect(leftovers).toEqual([]);
  });

  it("cleans up on shutdown even if an upload never finished", async () => {
    // Simulate an upload interrupted between materialization and cleanup.
    const recorder = makeSession({
      onSetFiles: () => {
        throw new Error("interrupted");
      },
    });
    await attachResumeToFileInput({
      session: recorder.session,
      semanticKey: "key",
      bytes: PDF,
    }).catch(() => undefined);

    await cleanupAllTempFiles();
    expect(trackedTempDirs()).toEqual([]);
    expect(
      readdirSync(tmpdir()).filter((e) => e.startsWith("job-engine-resume-")),
    ).toEqual([]);
  });
});
