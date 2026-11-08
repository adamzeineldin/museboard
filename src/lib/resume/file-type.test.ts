import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_RESUME_BYTES } from "./constants";
import { detectResumeKind, sanitizeFilename, validateResumeFile } from "./file-type";

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(import.meta.dirname, "__fixtures__", name)));
const bytes = (text: string): Uint8Array => new TextEncoder().encode(text);

describe("detectResumeKind (magic bytes)", () => {
  it("recognises the real fixtures", () => {
    expect(detectResumeKind(fixture("resume.pdf"))).toBe("pdf");
    expect(detectResumeKind(fixture("resume.docx"))).toBe("docx");
    expect(detectResumeKind(fixture("resume.txt"))).toBe("txt");
  });

  it("does not take a plain zip for a DOCX", () => {
    const zipHeader = new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...bytes("some/other.txt")]);
    expect(detectResumeKind(zipHeader)).toBeNull();
  });

  it("rejects binary data, invalid UTF-8 and empty files", () => {
    expect(detectResumeKind(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBeNull();
    expect(detectResumeKind(new Uint8Array([0x68, 0x69, 0x00, 0x68]))).toBeNull();
    expect(detectResumeKind(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
    expect(detectResumeKind(new Uint8Array([]))).toBeNull();
  });

  it("accepts UTF-8 text with a BOM and non-ASCII characters", () => {
    expect(detectResumeKind(new Uint8Array([0xef, 0xbb, 0xbf, ...bytes("José — Résumé")]))).toBe("txt");
  });
});

describe("validateResumeFile", () => {
  it("accepts a file whose extension and content agree", () => {
    expect(validateResumeFile("Resume_v3.pdf", fixture("resume.pdf"))).toEqual({ ok: true, kind: "pdf" });
    expect(validateResumeFile("cv.DOCX", fixture("resume.docx"))).toEqual({ ok: true, kind: "docx" });
    expect(validateResumeFile("cv.txt", fixture("resume.txt"))).toEqual({ ok: true, kind: "txt" });
  });

  it("rejects a renamed file (extension says PDF, bytes say text)", () => {
    const result = validateResumeFile("resume.pdf", bytes("just text pretending"));
    expect(result).toEqual({ ok: false, error: "That file isn't a real PDF. Export your resume as PDF, DOCX or TXT and try again." });
  });

  it("rejects unsupported extensions", () => {
    const result = validateResumeFile("resume.pages", fixture("resume.pdf"));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/PDF, DOCX or TXT/);
  });

  it("rejects empty and oversized files", () => {
    const empty = validateResumeFile("cv.txt", new Uint8Array());
    expect(empty).toEqual({ ok: false, error: "That file is empty." });
    const big = new Uint8Array(MAX_RESUME_BYTES + 1).fill(0x61);
    const tooBig = validateResumeFile("cv.txt", big);
    expect(tooBig).toEqual({ ok: false, error: "That file is larger than 5 MB. Upload a smaller file." });
  });

  it("accepts a file of exactly the limit", () => {
    const max = new Uint8Array(MAX_RESUME_BYTES).fill(0x61);
    expect(validateResumeFile("cv.txt", max)).toEqual({ ok: true, kind: "txt" });
  });
});

describe("sanitizeFilename", () => {
  it("strips paths, control characters and quotes, and caps the length", () => {
    expect(sanitizeFilename("C:\\Users\\me\\Resume.pdf")).toBe("Resume.pdf");
    expect(sanitizeFilename("../../etc/passwd")).toBe("passwd");
    expect(sanitizeFilename('my "cv"\u0007.pdf')).toBe("my cv.pdf");
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`)).toHaveLength(120);
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`).endsWith(".pdf")).toBe(true);
    expect(sanitizeFilename("   ")).toBe("resume");
  });
});
