"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { resumeFailure, resumeSuccess, type ResumeActionState } from "@/components/resume/action-state";
import { getSessionUserId } from "@/lib/current-user";
import { recomputeMatches } from "@/lib/matching";
import { deleteResume, MAX_RESUME_BYTES, MAX_RESUME_MB, ResumeError, setDefaultResume, uploadResume } from "@/lib/resume";

// Resume management actions. userId always comes from the session; the form only names a resume id
// (ownership is checked in src/lib/resume) or carries the uploaded file.

const SIGNED_OUT = "Your session ended. Sign in again.";
const resumeIdSchema = z.string().trim().min(1).max(100);

const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

function refresh(): void {
  revalidatePath("/settings");
  revalidatePath("/jobs");
}

/** Recompute scores after the default resume changed. Returns a note to append when it failed. */
async function rescore(userId: string): Promise<string> {
  try {
    await recomputeMatches(userId);
    return "";
  } catch (error) {
    console.error("[settings] recomputeMatches failed", { userId, error: errorDetail(error) });
    return " Match scores couldn't be updated right now; they refresh on the next job sync.";
  }
}

function failure(error: unknown, fallback: string, context: Record<string, unknown>): ResumeActionState {
  if (error instanceof ResumeError) return resumeFailure(error.message);
  console.error("[settings] resume action failed", { ...context, error: errorDetail(error) });
  return resumeFailure(fallback);
}

export async function uploadResumeAction(_prev: ResumeActionState, formData: FormData): Promise<ResumeActionState> {
  const userId = await getSessionUserId();
  if (!userId) return resumeFailure(SIGNED_OUT);

  const file = formData.get("resume");
  if (!(file instanceof File) || file.size === 0) return resumeFailure("Choose a PDF, DOCX or TXT file to upload.");
  if (file.size > MAX_RESUME_BYTES) return resumeFailure(`That file is larger than ${MAX_RESUME_MB} MB. Upload a smaller file.`);

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { resume, becameDefault } = await uploadResume(userId, { filename: file.name, bytes });
    const note = becameDefault ? await rescore(userId) : "";
    refresh();
    const lead = becameDefault
      ? `Uploaded ${resume.filename}. It's your default resume, so jobs are now ranked against it.`
      : `Uploaded ${resume.filename}. Make it the default to rank jobs against it.`;
    return resumeSuccess(`${lead}${note}`);
  } catch (error) {
    return failure(error, "We couldn't upload that resume. Try again in a moment.", { userId, action: "upload" });
  }
}

export async function setDefaultResumeAction(_prev: ResumeActionState, formData: FormData): Promise<ResumeActionState> {
  const userId = await getSessionUserId();
  if (!userId) return resumeFailure(SIGNED_OUT);
  const parsed = resumeIdSchema.safeParse(formData.get("resumeId"));
  if (!parsed.success) return resumeFailure("We couldn't tell which resume you meant. Reload and try again.");

  try {
    const resume = await setDefaultResume(userId, parsed.data);
    const note = await rescore(userId);
    refresh();
    return resumeSuccess(`${resume.filename} is now your default resume.${note}`);
  } catch (error) {
    return failure(error, "We couldn't change your default resume. Try again in a moment.", { userId, action: "set-default" });
  }
}

export async function deleteResumeAction(_prev: ResumeActionState, formData: FormData): Promise<ResumeActionState> {
  const userId = await getSessionUserId();
  if (!userId) return resumeFailure(SIGNED_OUT);
  const parsed = resumeIdSchema.safeParse(formData.get("resumeId"));
  if (!parsed.success) return resumeFailure("We couldn't tell which resume you meant. Reload and try again.");

  try {
    const { deleted, newDefault } = await deleteResume(userId, parsed.data);
    const note = deleted.isDefault ? await rescore(userId) : "";
    refresh();
    const follow = deleted.isDefault
      ? newDefault
        ? ` ${newDefault.filename} is your default now.`
        : " Upload another resume to see match scores."
      : "";
    return resumeSuccess(`Deleted ${deleted.filename}.${follow}${note}`);
  } catch (error) {
    return failure(error, "We couldn't delete that resume. Try again in a moment.", { userId, action: "delete" });
  }
}
