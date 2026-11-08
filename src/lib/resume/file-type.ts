import { KIND_LABELS, MAX_FILENAME_LENGTH, MAX_RESUME_BYTES, MAX_RESUME_MB, RESUME_KINDS, type ResumeKind } from "./constants";

// Content sniffing for resume uploads. The extension must be one we accept AND the bytes must match
// it: a renamed .exe or a text file called resume.pdf is rejected before anything is stored.

const PDF_MAGIC = [0x25, 0x50, 0x44, 0x46, 0x2d]; // "%PDF-"
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]; // "PK\x03\x04"
const SNIFF_WINDOW = 64 * 1024;

const startsWith = (bytes: Uint8Array, magic: readonly number[]): boolean =>
  bytes.length >= magic.length && magic.every((value, index) => bytes[index] === value);

function containsAscii(bytes: Uint8Array, needle: string, limit = SNIFF_WINDOW): boolean {
  const window = bytes.subarray(0, Math.min(bytes.length, limit));
  return Buffer.from(window.buffer, window.byteOffset, window.byteLength).includes(needle, 0, "latin1");
}

function looksLikeUtf8Text(bytes: Uint8Array): boolean {
  if (bytes.length === 0 || bytes.includes(0)) return false;
  try {
    new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    return true;
  } catch {
    return false;
  }
}

/** Identify a resume from its leading bytes. DOCX = a zip that holds word/document.xml. */
export function detectResumeKind(bytes: Uint8Array): ResumeKind | null {
  if (startsWith(bytes, PDF_MAGIC)) return "pdf";
  if (startsWith(bytes, ZIP_MAGIC)) {
    const isWordPackage =
      containsAscii(bytes, "word/document.xml") ||
      (containsAscii(bytes, "[Content_Types].xml") && containsAscii(bytes, "word/"));
    return isWordPackage ? "docx" : null;
  }
  return looksLikeUtf8Text(bytes) ? "txt" : null;
}

export function extensionKind(filename: string): ResumeKind | null {
  const ext = filename.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1];
  return RESUME_KINDS.find((kind) => kind === ext) ?? null;
}

export type ResumeFileCheck = { ok: true; kind: ResumeKind } | { ok: false; error: string };

export function validateResumeFile(filename: string, bytes: Uint8Array): ResumeFileCheck {
  const claimed = extensionKind(filename);
  if (!claimed) return { ok: false, error: "Upload a PDF, DOCX or TXT file." };
  if (bytes.length === 0) return { ok: false, error: "That file is empty." };
  if (bytes.length > MAX_RESUME_BYTES) {
    return { ok: false, error: `That file is larger than ${MAX_RESUME_MB} MB. Upload a smaller file.` };
  }
  const actual = detectResumeKind(bytes);
  if (actual !== claimed) {
    return {
      ok: false,
      error: `That file isn't a real ${KIND_LABELS[claimed]}. Export your resume as PDF, DOCX or TXT and try again.`,
    };
  }
  return { ok: true, kind: actual };
}

/** A display-safe filename: no directories, control characters or quotes, at most 120 characters. */
export function sanitizeFilename(filename: string): string {
  const base = filename.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f"<>|*?]/g, "").replace(/\s+/g, " ").trim();
  if (!cleaned || /^\.+$/.test(cleaned)) return "resume";
  if (cleaned.length <= MAX_FILENAME_LENGTH) return cleaned;
  const ext = cleaned.match(/\.[A-Za-z0-9]{1,5}$/)?.[0] ?? "";
  return `${cleaned.slice(0, MAX_FILENAME_LENGTH - ext.length)}${ext}`;
}
