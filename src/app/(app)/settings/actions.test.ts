import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_RESUME_STATE } from "@/components/resume/action-state";
import { createTestUser, db, resetDb } from "@/test/db";

const { getSessionUserId, recomputeMatches, revalidatePath } = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  recomputeMatches: vi.fn(),
  revalidatePath: vi.fn(),
}));
vi.mock("@/lib/current-user", () => ({ getSessionUserId }));
vi.mock("@/lib/matching", () => ({ recomputeMatches }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { deleteResumeAction, setDefaultResumeAction, uploadResumeAction } from "./actions";

const FIXTURES = path.resolve(import.meta.dirname, "../../../lib/resume/__fixtures__");
const fixtureFile = (name: string, as = name): File => new File([readFileSync(path.join(FIXTURES, name))], as);
const form = (entries: Record<string, string | File>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

let storageRoot: string;
beforeAll(() => {
  storageRoot = mkdtempSync(path.join(tmpdir(), "inroad-settings-"));
  process.env.INROAD_STORAGE_DIR = storageRoot;
});
afterAll(() => {
  delete process.env.INROAD_STORAGE_DIR;
  rmSync(storageRoot, { recursive: true, force: true });
});

describe("resume settings actions", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    recomputeMatches.mockResolvedValue(3);
  });

  it("uploads for the session user, makes the first one default and rescores", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    const state = await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: fixtureFile("resume.pdf", "Resume_v3.pdf") }));
    expect(state).toMatchObject({ status: "success", message: expect.stringMatching(/^Uploaded Resume_v3\.pdf\. It's your default/) });
    expect(recomputeMatches).toHaveBeenCalledWith(user.id);
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    expect(await db.resume.count({ where: { userId: user.id, isDefault: true } })).toBe(1);

    const second = await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: fixtureFile("resume.txt") }));
    expect(second.message).toMatch(/Make it the default/);
    expect(recomputeMatches).toHaveBeenCalledTimes(1);
  });

  it("rejects missing, oversized and disguised files with friendly messages", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    expect((await uploadResumeAction(IDLE_RESUME_STATE, form({}))).message).toMatch(/Choose a PDF/);
    const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.pdf");
    expect((await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: big }))).message).toMatch(/larger than 5 MB/);
    const fake = await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: fixtureFile("resume.txt", "resume.pdf") }));
    expect(fake).toMatchObject({ status: "error", message: expect.stringMatching(/isn't a real PDF/) });
  });

  it("still succeeds, with a note, when rescoring fails", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    recomputeMatches.mockRejectedValue(new Error("boom"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const state = await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: fixtureFile("resume.txt") }));
    expect(state.status).toBe("success");
    expect(state.message).toMatch(/couldn't be updated right now/);
    errorSpy.mockRestore();
  });

  it("sets the default and deletes, only for the owner", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: fixtureFile("resume.txt", "a.txt") }));
    await uploadResumeAction(IDLE_RESUME_STATE, form({ resume: fixtureFile("resume.txt", "b.txt") }));
    const b = await db.resume.findFirstOrThrow({ where: { filename: "b.txt" } });

    getSessionUserId.mockResolvedValue(other.id);
    expect((await setDefaultResumeAction(IDLE_RESUME_STATE, form({ resumeId: b.id }))).message).toMatch(/isn't yours/);
    expect((await deleteResumeAction(IDLE_RESUME_STATE, form({ resumeId: b.id }))).status).toBe("error");

    getSessionUserId.mockResolvedValue(user.id);
    expect((await setDefaultResumeAction(IDLE_RESUME_STATE, form({ resumeId: b.id }))).message).toBe("b.txt is now your default resume.");
    const deleted = await deleteResumeAction(IDLE_RESUME_STATE, form({ resumeId: b.id }));
    expect(deleted.message).toBe("Deleted b.txt. a.txt is your default now.");
    const a = await db.resume.findFirstOrThrow({ where: { filename: "a.txt" } });
    expect((await deleteResumeAction(IDLE_RESUME_STATE, form({ resumeId: a.id }))).message).toBe(
      "Deleted a.txt. Upload another resume to see match scores.",
    );
  });

  it("refuses without a session or with a missing id", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect((await uploadResumeAction(IDLE_RESUME_STATE, form({}))).message).toMatch(/Sign in/);
    expect((await setDefaultResumeAction(IDLE_RESUME_STATE, form({}))).message).toMatch(/Sign in/);
    expect((await deleteResumeAction(IDLE_RESUME_STATE, form({}))).message).toMatch(/Sign in/);
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    expect((await setDefaultResumeAction(IDLE_RESUME_STATE, form({}))).status).toBe("error");
    expect((await deleteResumeAction(IDLE_RESUME_STATE, form({ resumeId: " " }))).status).toBe("error");
  });
});
