// Resume upload limits and the file kinds Inroad accepts. Pure; safe to import from client components.

export const RESUME_KINDS = ["pdf", "docx", "txt"] as const;
export type ResumeKind = (typeof RESUME_KINDS)[number];

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;
export const MAX_RESUME_MB = 5;
/** Resumes one user can keep; bounds disk use and upload parsing per account. */
export const MAX_RESUMES_PER_USER = 10;
/** Max characters of extracted text we keep (a long resume is ~10k). */
export const MAX_PARSED_TEXT_CHARS = 100_000;
export const MAX_FILENAME_LENGTH = 120;
/** Max total unpacked size of a DOCX's zip entries (a real resume is well under 1 MB); blocks zip bombs. */
export const MAX_DOCX_UNCOMPRESSED_BYTES = 20 * 1024 * 1024;

export const RESUME_ACCEPT = ".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain";

export const RESUME_CONTENT_TYPES: Record<ResumeKind, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain; charset=utf-8",
};

export const KIND_LABELS: Record<ResumeKind, string> = { pdf: "PDF", docx: "DOCX", txt: "TXT" };
