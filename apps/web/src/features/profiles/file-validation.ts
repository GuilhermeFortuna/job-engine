export const RESUME_ACCEPT = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

export const AVATAR_ACCEPT = [
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

export const RESUME_MAX_BYTES = 20 * 1024 * 1024;
export const AVATAR_MAX_BYTES = 10 * 1024 * 1024;

export type FileKind = "resume" | "avatar";

export interface FileValidationResult {
  ok: boolean;
  error: string | null;
}

function extensionOf(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx >= 0 ? name.slice(idx).toLowerCase() : "";
}

export function validateUploadFile(
  file: File,
  kind: FileKind,
): FileValidationResult {
  if (kind === "resume") {
    const okType =
      RESUME_ACCEPT.includes(file.type as (typeof RESUME_ACCEPT)[number]) ||
      [".pdf", ".docx"].includes(extensionOf(file.name));
    if (!okType) {
      return { ok: false, error: "Choose a PDF or DOCX resume." };
    }
    if (file.size > RESUME_MAX_BYTES) {
      return { ok: false, error: "Resume must be 20 MB or smaller." };
    }
    return { ok: true, error: null };
  }

  const okType =
    AVATAR_ACCEPT.includes(file.type as (typeof AVATAR_ACCEPT)[number]) ||
    [".png", ".jpg", ".jpeg", ".webp"].includes(extensionOf(file.name));
  if (!okType) {
    return { ok: false, error: "Choose a PNG, JPEG, or WebP image." };
  }
  if (file.size > AVATAR_MAX_BYTES) {
    return { ok: false, error: "Photo must be 10 MB or smaller." };
  }
  return { ok: true, error: null };
}

export function acceptAttribute(kind: FileKind): string {
  return kind === "resume"
    ? ".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    : "image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp";
}
