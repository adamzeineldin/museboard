import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import type { Embedder } from "./embedder";
import { recomputeMatches } from "./recompute";
import { BACKEND_INTERN_POSTING, SALES_POSTING, SWE_RESUME } from "./__fixtures__/texts";

async function seedJobs() {
  const company = await db.company.create({ data: { name: "Datadog", ats: "greenhouse" } });
  const base = { companyId: company.id, location: "New York", type: "intern", url: "https://example.com", source: "Greenhouse feed" };
  await db.job.create({ data: { ...base, id: "gh:datadog:1", title: BACKEND_INTERN_POSTING.title, description: BACKEND_INTERN_POSTING.description } });
  await db.job.create({ data: { ...base, id: "gh:datadog:2", title: SALES_POSTING.title, description: SALES_POSTING.description } });
  await db.job.create({ data: { ...base, id: "gh:datadog:3", title: "Closed SWE Intern", description: null, closedAt: new Date() } });
}

async function addResume(userId: string, parsedText: string, isDefault = true) {
  return db.resume.create({ data: { userId, filename: "cv.pdf", storageKey: `resumes/${userId}/x.pdf`, parsedText, isDefault } });
}

describe("recomputeMatches", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("scores every open job against the default resume and stores reasons", async () => {
    const user = await createTestUser();
    await seedJobs();
    await addResume(user.id, SWE_RESUME);

    expect(await recomputeMatches(user.id)).toBe(2);
    const matches = await db.match.findMany({ where: { userId: user.id }, orderBy: { score: "desc" } });
    expect(matches.map((m) => m.jobId)).toEqual(["gh:datadog:1", "gh:datadog:2"]);
    expect(matches[0].score).toBeGreaterThanOrEqual(75);
    expect(matches[1].score).toBeLessThan(45);
    expect(matches[0].reasons).toMatchObject({ skills: expect.arrayContaining(["Go", "Python"]) });
    expect((matches[0].reasons as { skills: string[] }).skills.length).toBeLessThanOrEqual(6);
  });

  it("upserts on rerun, uses the current default, and drops matches for jobs that closed", async () => {
    const user = await createTestUser();
    await seedJobs();
    const first = await addResume(user.id, SWE_RESUME);
    await recomputeMatches(user.id);
    // A stale match for a closed job (e.g. computed before it closed).
    await db.match.create({ data: { userId: user.id, jobId: "gh:datadog:3", score: 80, reasons: { skills: [], similarity: 0.4 } } });

    await db.resume.update({ where: { id: first.id }, data: { isDefault: false } });
    await addResume(user.id, "Account executive. B2B SaaS sales, quota, pipeline, Salesforce, negotiating contracts and closing deals.");
    expect(await recomputeMatches(user.id)).toBe(2);

    const matches = await db.match.findMany({ where: { userId: user.id } });
    expect(matches).toHaveLength(2);
    const byJob = Object.fromEntries(matches.map((m) => [m.jobId, m.score]));
    expect(byJob["gh:datadog:2"]).toBeGreaterThan(byJob["gh:datadog:1"]);
  });

  it("clears matches and returns 0 when the user has no default resume", async () => {
    const user = await createTestUser();
    await seedJobs();
    await db.match.create({ data: { userId: user.id, jobId: "gh:datadog:1", score: 80, reasons: {} } });
    expect(await recomputeMatches(user.id)).toBe(0);
    expect(await db.match.count({ where: { userId: user.id } })).toBe(0);
  });

  it("does not touch other users' matches", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await seedJobs();
    await addResume(user.id, SWE_RESUME);
    await db.match.create({ data: { userId: other.id, jobId: "gh:datadog:3", score: 50, reasons: {} } });
    await recomputeMatches(user.id);
    expect(await db.match.count({ where: { userId: other.id } })).toBe(1);
  });

  it("uses an injected embedder and rejects one that returns the wrong number of vectors", async () => {
    const user = await createTestUser();
    await seedJobs();
    await addResume(user.id, SWE_RESUME);
    const constant: Embedder = { name: "constant", embed: async (texts) => texts.map(() => [1, 0, 0]) };
    await recomputeMatches(user.id, { embedder: constant });
    const reasons = (await db.match.findFirstOrThrow({ where: { userId: user.id, jobId: "gh:datadog:2" } })).reasons;
    expect(reasons).toEqual({ skills: [], similarity: 1 });

    const broken: Embedder = { name: "broken", embed: async () => [[1]] };
    await expect(recomputeMatches(user.id, { embedder: broken })).rejects.toThrow(/returned 1 vectors/);
  });
});
