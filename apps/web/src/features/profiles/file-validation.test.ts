import { describe, expect, it } from "vitest";
import { validateUploadFile } from "./file-validation";

describe("validateUploadFile", () => {
  it("accepts PDF and DOCX resumes under the size limit", () => {
    expect(
      validateUploadFile(
        new File(["resume"], "cv.pdf", { type: "application/pdf" }),
        "resume",
      ).ok,
    ).toBe(true);
    expect(
      validateUploadFile(
        new File(["resume"], "cv.docx", {
          type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }),
        "resume",
      ).ok,
    ).toBe(true);
  });

  it("rejects local-path style inputs by requiring an actual File upload", () => {
    expect(
      validateUploadFile(
        new File(["x"], "notes.txt", { type: "text/plain" }),
        "resume",
      ),
    ).toEqual({ ok: false, error: "Choose a PDF or DOCX resume." });
  });
});
