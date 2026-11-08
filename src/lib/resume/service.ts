import "server-only";
import type { Resume } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import { pendingVersion, pickVersionInForce } from "@/lib/rules";
import { parseCampaignRules } from "@/lib/types";
import { MAX_RESUMES_PER_USER, RESUME_CONTENT_TYPES, type ResumeKind } from "./constants";
import { extractResumeText, ResumeExtractionError } from "./extract";
import { extensionKind, sanitizeFilename, validateResumeFile } from "./file-type";
import { getResumeStorage, newResumeStorageKey, type FileStorage } from "./storage";

// Resume lifecycle: upload (validate -> extract -> store -> row), set default, delete, download.
// Every function takes the owner's userId (from the session) and only touches that user's rows.

export type ResumeErrorCode = "invalid_file" | "limit_reached" | "extraction_failed" | "not_found" | "in_use" | "storage_failed";

/** An expected failure whose message is safe to show the user. */
export class ResumeError extends Error {
  constructor(
    readonly code: ResumeErrorCode,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ResumeError";
  }
}

export interface ResumeDeps {
  storage?: FileStorage;
}

const NOT_FOUND = "That resume doesn't exist or isn't yours.";
const LIMIT_REACHED = `Inroad keeps up to ${MAX_RESUMES_PER_USER} resumes per account. Delete one that isn't attached to an application to upload another.`;
const LIVE_CAMPAIGN_STATUSES = ["active", "paused"];

const storageOf = (deps: ResumeDeps): FileStorage => deps.storage ?? getResumeStorage();

const errorDetail = (error: unknown): string => (error instanceof Error ? error.message : String(error));

export async function listResumes(userId: string): Promise<Resume[]> {
  return db.resume.findMany({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }, { id: "desc" }] });
}

export async function getDefaultResume(userId: string): Promise<Resume | null> {
  return db.resume.findFirst({ where: { userId, isDefault: true }, orderBy: { createdAt: "desc" } });
}

export async function getOwnedResume(userId: string, resumeId: string): Promise<Resume | null> {
  return db.resume.findFirst({ where: { id: resumeId, userId } });
}

export interface UploadInput {
  filename: string;
  bytes: Uint8Array;
}

export interface UploadResult {
  resume: Resume;
  becameDefault: boolean;
}

async function extractOrThrow(bytes: Uint8Array, kind: ResumeKind): Promise<string> {
  try {
    return await extractResumeText(bytes, kind);
  } catch (error) {
    if (error instanceof ResumeExtractionError) throw new ResumeError("extraction_failed", error.message, { cause: error });
    throw error;
  }
}

interface NewResumeRow {
  userId: string;
  filename: string;
  storageKey: string;
  parsedText: string;
}

/** Re-counts inside the transaction: concurrent uploads can all pass the cheap pre-check, but only one wins the last slot. */
async function createResumeRow(row: NewResumeRow): Promise<Resume> {
  return db.$transaction(async (tx) => {
    if ((await tx.resume.count({ where: { userId: row.userId } })) >= MAX_RESUMES_PER_USER) {
      throw new ResumeError("limit_reached", LIMIT_REACHED);
    }
    const hasDefault = (await tx.resume.count({ where: { userId: row.userId, isDefault: true } })) > 0;
    return tx.resume.create({ data: { ...row, isDefault: !hasDefault } });
  });
}

export async function uploadResume(userId: string, input: UploadInput, deps: ResumeDeps = {}): Promise<UploadResult> {
  const filename = sanitizeFilename(input.filename);
  const check = validateResumeFile(filename, input.bytes);
  if (!check.ok) throw new ResumeError("invalid_file", check.error);
  // Checked before parsing and storing, so a user at the cap costs no CPU or disk.
  if ((await db.resume.count({ where: { userId } })) >= MAX_RESUMES_PER_USER) throw new ResumeError("limit_reached", LIMIT_REACHED);

  const parsedText = await extractOrThrow(input.bytes, check.kind);
  const storage = storageOf(deps);
  const storageKey = newResumeStorageKey(userId, check.kind);
  try {
    await storage.put(storageKey, input.bytes);
  } catch (error) {
    console.error("[resume] storing file failed", { userId, storageKey, error: errorDetail(error) });
    throw new ResumeError("storage_failed", "We couldn't save that file. Try again in a moment.", { cause: error });
  }

  try {
    const resume = await createResumeRow({ userId, filename, storageKey, parsedText });
    await writeAudit(userId, "user", "resume.uploaded", {
      resumeId: resume.id,
      filename,
      kind: check.kind,
      bytes: input.bytes.length,
      textChars: parsedText.length,
      isDefault: resume.isDefault,
    });
    return { resume, becameDefault: resume.isDefault };
  } catch (error) {
    await storage.delete(storageKey).catch((cleanupError: unknown) => {
      console.error("[resume] cleanup after failed upload failed", { userId, storageKey, error: errorDetail(cleanupError) });
    });
    throw error;
  }
}

export async function setDefaultResume(userId: string, resumeId: string): Promise<Resume> {
  const target = await getOwnedResume(userId, resumeId);
  if (!target) throw new ResumeError("not_found", NOT_FOUND);
  if (target.isDefault) return target;
  const updated = await db.$transaction(async (tx) => {
    await tx.resume.updateMany({ where: { userId, isDefault: true }, data: { isDefault: false } });
    return tx.resume.update({ where: { id: target.id }, data: { isDefault: true } });
  });
  await writeAudit(userId, "user", "resume.default_set", { resumeId: updated.id, filename: updated.filename });
  return updated;
}

/** A user-facing reason this resume can't be deleted, or null. */
async function deleteBlocker(userId: string, resumeId: string): Promise<string | null> {
  const campaigns = await db.campaign.findMany({
    where: { userId, status: { in: LIVE_CAMPAIGN_STATUSES } },
    include: { versions: true },
  });
  for (const campaign of campaigns) {
    const inForce = pickVersionInForce(campaign.versions);
    if (inForce && parseCampaignRules(inForce.rules)?.resumeId === resumeId) {
      return "Your approved campaign uses this resume. Pick a different resume on the Campaign page and approve that change, then delete this one.";
    }
    const pending = pendingVersion(campaign.versions);
    if (pending && parseCampaignRules(pending.rules)?.resumeId === resumeId) {
      return "Your campaign changes waiting for approval use this resume. Pick a different resume there first.";
    }
  }
  const applications = await db.application.count({ where: { userId, resumeId } });
  if (applications > 0) {
    const noun = applications === 1 ? "application" : "applications";
    return `This resume is attached to ${applications} ${noun}, so Inroad keeps it for your records.`;
  }
  return null;
}

export interface DeleteResult {
  deleted: Resume;
  newDefault: Resume | null;
}

export async function deleteResume(userId: string, resumeId: string, deps: ResumeDeps = {}): Promise<DeleteResult> {
  const target = await getOwnedResume(userId, resumeId);
  if (!target) throw new ResumeError("not_found", NOT_FOUND);
  const blocker = await deleteBlocker(userId, target.id);
  if (blocker) throw new ResumeError("in_use", blocker);

  const newDefault = await db.$transaction(async (tx) => {
    await tx.resume.delete({ where: { id: target.id } });
    if (!target.isDefault) return null;
    const next = await tx.resume.findFirst({ where: { userId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    return next ? tx.resume.update({ where: { id: next.id }, data: { isDefault: true } }) : null;
  });
  await writeAudit(userId, "user", "resume.deleted", {
    resumeId: target.id,
    filename: target.filename,
    wasDefault: target.isDefault,
    newDefaultId: newDefault?.id ?? null,
  });
  await storageOf(deps)
    .delete(target.storageKey)
    .catch((error: unknown) => {
      // The row is gone; an orphaned file is harmless but worth knowing about.
      console.error("[resume] deleting stored file failed", { userId, storageKey: target.storageKey, error: errorDetail(error) });
    });
  return { deleted: target, newDefault };
}

export interface ResumeFile {
  resume: Resume;
  bytes: Buffer;
  contentType: string;
}

/** The stored file for the owner, or null when the resume isn't theirs or the file is missing. */
export async function readResumeFile(userId: string, resumeId: string, deps: ResumeDeps = {}): Promise<ResumeFile | null> {
  const resume = await getOwnedResume(userId, resumeId);
  if (!resume) return null;
  const kind = extensionKind(resume.storageKey) ?? extensionKind(resume.filename) ?? "txt";
  try {
    const bytes = await storageOf(deps).get(resume.storageKey);
    return { resume, bytes, contentType: RESUME_CONTENT_TYPES[kind] };
  } catch (error) {
    console.error("[resume] reading stored file failed", { userId, resumeId, error: errorDetail(error) });
    return null;
  }
}
