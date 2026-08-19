import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { IsolatedWorldSession } from "./isolated-world";

/**
 * Attaches the granted resume to a file control.
 *
 * The PDF exists on disk for as short a time as possible, in a directory only
 * this user can read, under a name that reveals nothing about the applicant or
 * the run. Every exit path deletes it: success, refusal, protocol error,
 * renderer crash, and process shutdown.
 */

export class UploadError extends Error {}

/**
 * Temporary directories currently holding resume bytes.
 *
 * Tracked at module scope so a shutdown or crash handler can remove what an
 * interrupted upload could not clean up itself.
 */
const liveTempDirs = new Set<string>();

/** Remove every temporary resume directory. Safe to call repeatedly. */
export async function cleanupAllTempFiles(): Promise<void> {
  const dirs = [...liveTempDirs];
  liveTempDirs.clear();
  await Promise.all(
    dirs.map((dir) => rm(dir, { recursive: true, force: true }).catch(() => {})),
  );
}

/** Directories still on disk. Exposed for tests and shutdown assertions. */
export function trackedTempDirs(): string[] {
  return [...liveTempDirs];
}

export interface ResumeUploadRequest {
  session: IsolatedWorldSession;
  /** Identity of the file control, from the current observation. */
  semanticKey: string;
  /** Verified PDF bytes. Checksums are validated before this is called. */
  bytes: Buffer;
}

export interface ResumeUploadResult {
  attached: boolean;
  /** The name the page reports, for page-visible verification. */
  reason: "ATTACHED" | "NO_FILE_INPUT" | "SET_FILES_FAILED";
}

/**
 * Materialize the resume, attach it through CDP, and delete it.
 *
 * `DOM.setFileInputFiles` needs a real path, which is the only reason the
 * bytes touch disk at all.
 */
export async function attachResumeToFileInput(
  request: ResumeUploadRequest,
): Promise<ResumeUploadResult> {
  const { session, semanticKey, bytes } = request;

  const objectId = await session.callForObjectId({
    op: "locateFileInput",
    semanticKey,
  });
  if (objectId === null) {
    return { attached: false, reason: "NO_FILE_INPUT" };
  }

  // A per-upload directory outside the repository. mkdtemp creates it 0700,
  // so no other user can read the bytes while they exist.
  const dir = await mkdtemp(join(tmpdir(), "job-engine-resume-"));
  liveTempDirs.add(dir);

  // Non-user-derived name: nothing about the applicant or the employer leaks
  // into a path that other processes can see.
  const safeName = `${randomBytes(16).toString("hex")}.pdf`;
  const filePath = join(dir, safeName);

  try {
    await writeFile(filePath, bytes, { mode: 0o600 });

    await session.send("DOM.setFileInputFiles", {
      objectId,
      files: [filePath],
    });

    return { attached: true, reason: "ATTACHED" };
  } catch (error) {
    throw new UploadError(
      `Resume upload failed: ${error instanceof Error ? error.message : "unknown"}`,
    );
  } finally {
    // The renderer has read the file by the time setFileInputFiles resolves,
    // so it can go immediately -- including when the attach above threw.
    liveTempDirs.delete(dir);
    await rm(dir, { recursive: true, force: true }).catch(() => {});
    await session.releaseObject(objectId);
  }
}
