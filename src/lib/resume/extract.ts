import { MAX_PARSED_TEXT_CHARS, type ResumeKind } from "./constants";

// Resume text extraction: unpdf for PDF, mammoth for DOCX, UTF-8 for TXT. Failures become a
// ResumeExtractionError whose message is safe to show the user.

export class ResumeExtractionError extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ResumeExtractionError";
  }
}

const NO_TEXT =
  "We couldn't find any text in that file. If it's a scanned PDF, export a text-based PDF or a DOCX and upload that.";

/** Collapse spaces/tabs, trim each line, keep at most one blank line, drop control and zero-width chars. */
export function normalizeWhitespace(text: string): string {
  return (
    text
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‍﻿]/g, "")
      .replace(/\r\n?/g, "\n")
      .replace(/[^\S\n]+/g, " ")
      .split("\n")
      .map((line) => line.trim())
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

async function extractPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  // pdf.js takes ownership of the buffer it is given, so pass a copy.
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

async function extractDocx(bytes: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const extractRawText = mammoth.extractRawText ?? mammoth.default.extractRawText;
  const result = await extractRawText({ buffer: Buffer.from(bytes) });
  return result.value;
}

function extractTxt(bytes: Uint8Array): string {
  return new TextDecoder("utf-8", { fatal: false, ignoreBOM: false }).decode(bytes);
}

const LABEL: Record<ResumeKind, string> = { pdf: "PDF", docx: "DOCX", txt: "text file" };

export async function extractResumeText(bytes: Uint8Array, kind: ResumeKind): Promise<string> {
  let raw: string;
  try {
    raw = kind === "pdf" ? await extractPdf(bytes) : kind === "docx" ? await extractDocx(bytes) : extractTxt(bytes);
  } catch (error) {
    throw new ResumeExtractionError(
      `We couldn't read that ${LABEL[kind]}. It may be damaged or password-protected. Try exporting it again.`,
      { cause: error },
    );
  }
  const text = normalizeWhitespace(raw).slice(0, MAX_PARSED_TEXT_CHARS);
  if (!text) throw new ResumeExtractionError(NO_TEXT);
  return text;
}
