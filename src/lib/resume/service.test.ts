import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { resumeDownloadPath } from "./paths";
import {
  deleteResume,
  getDefaultResume,
  listResumes,
  readResumeFile,
  ResumeError,
  setDefaultResume,
  uploadResume,
} from "./service";
import { LocalDiskStorage, type FileStorage } from "./storage";

const fixture = (name: string): Uint8Array => new Uint8Array(readFileSync(path.join(import.meta.dirname, "__fixtures__", name)));

let root: string;
let storage: LocalDiskStorage;

beforeEach(async () => {
  await resetDb();
  root = mkdtempSync(path.join(tmpdir(), "inroad-resumes-"));
  storage = new LocalDiskStorage(root);
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const RULES = (resumeId: string) => ({
  roles: ["intern"],
  autoCompanies: ["Stripe"],
  askFirstCompanies: [],
  resumeId,
  weeklyCap: 5,
  minMatch: 75,
  endsOn: "2026-12-15",
});

async function expectResumeError(promise: Promise<unknown>, code: string): Promise<ResumeError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(ResumeError);
  expect((error as ResumeError).code).toBe(code);
  return error as ResumeError;
}

describe("uploadResume", () => {
  it("stores the file, extracts text, makes the first resume default and audits", async () => {
    const user = await createTestUser();
    const { resume, becameDefault } = await uploadResume(user.id, { filename: "Resume_v3.pdf", bytes: fixture("resume.pdf") }, { storage });
    expect(becameDefault).toBe(true);
    expect(resume).toMatchObject({ userId: user.id, filename: "Resume_v3.pdf", isDefault: true });
    expect(resume.storageKey).toMatch(new RegExp(`^resumes/${user.id}/[a-f0-9]{32}\\.pdf$`));
    expect(resume.parsedText).toContain("Raft key-value store");
    expect([...(await storage.get(resume.storageKey))]).toEqual([...fixture("resume.pdf")]);
    const audit = await db.auditEvent.findFirstOrThrow({ where: { userId: user.id, action: "resume.uploaded" } });
    expect(audit.payload).toMatchObject({ resumeId: resume.id, kind: "pdf", isDefault: true });
  });

  it("keeps the existing default when a second resume is uploaded", async () => {
    const user = await createTestUser();
    const first = await uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    const second = await uploadResume(user.id, { filename: "b.docx", bytes: fixture("resume.docx") }, { storage });
    expect(second.becameDefault).toBe(false);
    expect((await getDefaultResume(user.id))?.id).toBe(first.resume.id);
    expect(second.resume.parsedText).toContain("Jordan Lee");
  });

  it("rejects a file whose bytes don't match its extension and stores nothing", async () => {
    const user = await createTestUser();
    const error = await expectResumeError(
      uploadResume(user.id, { filename: "resume.pdf", bytes: fixture("resume.txt") }, { storage }),
      "invalid_file",
    );
    expect(error.message).toMatch(/isn't a real PDF/);
    expect(await db.resume.count()).toBe(0);
  });

  it("surfaces extraction failures to the user", async () => {
    const user = await createTestUser();
    const error = await expectResumeError(
      uploadResume(user.id, { filename: "scan.txt", bytes: new TextEncoder().encode("  \n ") }, { storage }),
      "extraction_failed",
    );
    expect(error.message).toMatch(/couldn't find any text/);
  });

  it("reports storage failures without creating a row", async () => {
    const user = await createTestUser();
    const failing: FileStorage = {
      put: async () => {
        throw new Error("disk full");
      },
      get: async () => Buffer.from(""),
      delete: async () => undefined,
    };
    await expectResumeError(uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage: failing }), "storage_failed");
    expect(await db.resume.count()).toBe(0);
  });

  it("sanitizes the stored filename", async () => {
    const user = await createTestUser();
    const { resume } = await uploadResume(user.id, { filename: "../../secret/cv.txt", bytes: fixture("resume.txt") }, { storage });
    expect(resume.filename).toBe("cv.txt");
  });
});

describe("setDefaultResume", () => {
  it("moves the default flag and audits", async () => {
    const user = await createTestUser();
    const a = await uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    const b = await uploadResume(user.id, { filename: "b.txt", bytes: fixture("resume.txt") }, { storage });
    await setDefaultResume(user.id, b.resume.id);
    const all = await listResumes(user.id);
    expect(all.map((r) => [r.id, r.isDefault])).toEqual([
      [b.resume.id, true],
      [a.resume.id, false],
    ]);
    expect(await db.auditEvent.count({ where: { action: "resume.default_set" } })).toBe(1);
    // Setting the current default again is a no-op.
    await setDefaultResume(user.id, b.resume.id);
    expect(await db.auditEvent.count({ where: { action: "resume.default_set" } })).toBe(1);
  });

  it("refuses another user's resume", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { resume } = await uploadResume(owner.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    await expectResumeError(setDefaultResume(other.id, resume.id), "not_found");
  });
});

describe("deleteResume", () => {
  it("deletes the row and file and promotes the newest remaining resume to default", async () => {
    const user = await createTestUser();
    const a = await uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    const b = await uploadResume(user.id, { filename: "b.txt", bytes: fixture("resume.txt") }, { storage });
    const result = await deleteResume(user.id, a.resume.id, { storage });
    expect(result.newDefault?.id).toBe(b.resume.id);
    expect(await db.resume.findUnique({ where: { id: a.resume.id } })).toBeNull();
    await expect(storage.get(a.resume.storageKey)).rejects.toThrow();
    expect(await db.auditEvent.count({ where: { action: "resume.deleted" } })).toBe(1);
  });

  it("refuses when the approved campaign version uses it, even if a pending version doesn't", async () => {
    const user = await createTestUser();
    const a = await uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    const b = await uploadResume(user.id, { filename: "b.txt", bytes: fixture("resume.txt") }, { storage });
    const campaign = await db.campaign.create({ data: { userId: user.id, status: "active" } });
    await db.campaignVersion.create({
      data: { campaignId: campaign.id, rules: RULES(a.resume.id), approvedAt: new Date("2026-11-01"), approvedVia: "web", createdAt: new Date("2026-11-01") },
    });
    await db.campaignVersion.create({ data: { campaignId: campaign.id, rules: RULES(b.resume.id), createdAt: new Date("2026-11-02") } });

    const inForce = await expectResumeError(deleteResume(user.id, a.resume.id, { storage }), "in_use");
    expect(inForce.message).toMatch(/approved campaign uses this resume/);
    const pending = await expectResumeError(deleteResume(user.id, b.resume.id, { storage }), "in_use");
    expect(pending.message).toMatch(/waiting for approval/);
    expect(await db.resume.count()).toBe(2);
  });

  it("allows deleting a resume used only by a revoked campaign", async () => {
    const user = await createTestUser();
    const a = await uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    const campaign = await db.campaign.create({ data: { userId: user.id, status: "revoked" } });
    await db.campaignVersion.create({ data: { campaignId: campaign.id, rules: RULES(a.resume.id), approvedAt: new Date() } });
    const result = await deleteResume(user.id, a.resume.id, { storage });
    expect(result.newDefault).toBeNull();
  });

  it("refuses when applications reference the resume", async () => {
    const user = await createTestUser();
    const a = await uploadResume(user.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    const company = await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
    const job = await db.job.create({
      data: { id: "greenhouse:stripe:1", companyId: company.id, title: "SWE Intern", location: "NYC", type: "intern", url: "https://x", source: "Greenhouse feed" },
    });
    await db.application.create({
      data: { userId: user.id, jobId: job.id, resumeId: a.resume.id, status: "waiting", decidedBy: "campaign", reason: "Weekly limit reached" },
    });
    const error = await expectResumeError(deleteResume(user.id, a.resume.id, { storage }), "in_use");
    expect(error.message).toBe("This resume is attached to 1 application, so Inroad keeps it for your records.");
  });

  it("refuses another user's resume", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { resume } = await uploadResume(owner.id, { filename: "a.txt", bytes: fixture("resume.txt") }, { storage });
    await expectResumeError(deleteResume(other.id, resume.id, { storage }), "not_found");
    expect(await db.resume.count()).toBe(1);
  });
});

describe("readResumeFile", () => {
  it("returns bytes and content type to the owner only", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { resume } = await uploadResume(owner.id, { filename: "cv.docx", bytes: fixture("resume.docx") }, { storage });
    const file = await readResumeFile(owner.id, resume.id, { storage });
    expect(file?.contentType).toMatch(/wordprocessingml/);
    expect(file?.bytes.length).toBe(fixture("resume.docx").length);
    expect(await readResumeFile(other.id, resume.id, { storage })).toBeNull();
  });

  it("returns null when the stored file is missing", async () => {
    const owner = await createTestUser();
    const { resume } = await uploadResume(owner.id, { filename: "cv.txt", bytes: fixture("resume.txt") }, { storage });
    await storage.delete(resume.storageKey);
    expect(await readResumeFile(owner.id, resume.id, { storage })).toBeNull();
  });
});

describe("resumeDownloadPath", () => {
  it("points at the auth-checked route", () => {
    expect(resumeDownloadPath("res_123")).toBe("/api/resumes/res_123");
  });
});
