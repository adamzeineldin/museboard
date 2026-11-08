import "server-only";

// Contract: docs/ARCHITECTURE.md (src/lib/resume). Upload storage + text extraction (pdf, docx, txt).
export {
  deleteResume,
  getDefaultResume,
  getOwnedResume,
  listResumes,
  readResumeFile,
  ResumeError,
  setDefaultResume,
  uploadResume,
  type DeleteResult,
  type ResumeDeps,
  type ResumeErrorCode,
  type ResumeFile,
  type UploadInput,
  type UploadResult,
} from "./service";
export { resumeDownloadPath } from "./paths";
export { MAX_RESUME_BYTES, MAX_RESUME_MB, RESUME_ACCEPT, RESUME_KINDS, type ResumeKind } from "./constants";
export { detectResumeKind, validateResumeFile } from "./file-type";
export { extractResumeText, ResumeExtractionError } from "./extract";
export { getResumeStorage, LocalDiskStorage, type FileStorage } from "./storage";
