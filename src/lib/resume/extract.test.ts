import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractResumeText, normalizeWhitespace, ResumeExtractionError } from "./extract";

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(import.meta.dirname, "__fixtures__", name)));

describe("normalizeWhitespace", () => {
  it("collapses runs of spaces, trims lines and keeps single blank lines", () => {
    expect(normalizeWhitespace("  a \t b \r\n\r\n\r\n c\u00a0\u00a0d  \n")).toBe("a b\n\nc d");
    expect(normalizeWhitespace("\u0000x\u200by")).toBe("xy");
  });
});

describe("extractResumeText", () => {
  it.each(["pdf", "docx", "txt"] as const)("extracts text from the %s fixture", async (kind) => {
    const text = await extractResumeText(fixture(`resume.${kind}`), kind);
    expect(text).toContain("Jordan Lee");
    expect(text).toContain("Python, TypeScript, Go");
    expect(text).toContain("Raft key-value store");
    expect(text).not.toMatch(/ {2,}/);
  });

  it("strips a UTF-8 BOM from text files", async () => {
    const text = await extractResumeText(new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69, 0x20, 0x74, 0x68, 0x65, 0x72, 0x65]), "txt");
    expect(text).toBe("hi there");
  });

  it("explains when a file has no text (e.g. a scanned PDF)", async () => {
    await expect(extractResumeText(new TextEncoder().encode("   \n  "), "txt")).rejects.toThrow(ResumeExtractionError);
    await expect(extractResumeText(new TextEncoder().encode("   \n  "), "txt")).rejects.toThrow(/couldn't find any text/);
  });

  it("wraps parser failures in a friendly error", async () => {
    const broken = new TextEncoder().encode("%PDF-1.4\nthis is not really a pdf");
    await expect(extractResumeText(broken, "pdf")).rejects.toThrow(/couldn't read that PDF/);
    const brokenDocx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2, 3]);
    await expect(extractResumeText(brokenDocx, "docx")).rejects.toThrow(/couldn't read that DOCX/);
  });
});
