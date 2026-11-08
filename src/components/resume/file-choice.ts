// Client-side state for the resume file picker. Pure.
import { MAX_RESUME_BYTES, MAX_RESUME_MB } from "@/lib/resume/constants";
import type { ResumeActionState } from "./action-state";

const ALLOWED_EXTENSION = /\.(pdf|docx|txt)$/i;

type PickedFile = Pick<File, "name" | "size">;

/** Quick client-side check; the server re-checks size and magic bytes. */
export function clientProblem(file: PickedFile | undefined): string | null {
  if (!file) return null;
  if (!ALLOWED_EXTENSION.test(file.name)) return "Upload a PDF, DOCX or TXT file.";
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_RESUME_BYTES) return `That file is larger than ${MAX_RESUME_MB} MB. Upload a smaller file.`;
  return null;
}

/**
 * A file the user picked, tied to the action result shown at the time. React resets the form (and
 * clears the file input) after every action, so a choice made before the latest result no longer counts.
 */
export interface FileChoice {
  forState: ResumeActionState;
  problem: string | null;
}

export function chooseFile(file: PickedFile | undefined, state: ResumeActionState): FileChoice | null {
  return file ? { forState: state, problem: clientProblem(file) } : null;
}

export function activeChoice(choice: FileChoice | null, state: ResumeActionState): FileChoice | null {
  return choice?.forState === state ? choice : null;
}
