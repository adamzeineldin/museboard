import { beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { failedCompany, okCompany, rawJob, rawRun } from "./fixtures";
import { formatSummary, runPass, type Logger } from "./pass";

const NOW = new Date("2026-11-07T12:00:00Z");

type LogFn = (message: string) => void;

function silentLogger(): Logger & { info: Mock<LogFn>; warn: Mock<LogFn>; error: Mock<LogFn> } {
  return { info: vi.fn<LogFn>(), warn: vi.fn<LogFn>(), error: vi.fn<LogFn>() };
}

async function userWithResume(isDefault: boolean): Promise<string> {
  const user = await createTestUser();
  await db.resume.create({ data: { userId: user.id, filename: "cv.pdf", storageKey: `k-${user.id}`, isDefault } });
  return user.id;
}

describe("runPass", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("scrapes, ingests and recomputes matches for users with a default resume", async () => {
    const withDefault = await userWithResume(true);
    await userWithResume(false);
    await createTestUser();
    const recompute = vi.fn(async () => 3);
    const run = rawRun([okCompany([rawJob("1")]), failedCompany("Capital One", "workday", "listing truncated")]);
    const logger = silentLogger();

    const summary = await runPass({
      prisma: db,
      scrape: async () => ({ json: run, exitCode: 0, stderr: "" }),
      recompute,
      now: () => NOW,
      logger,
    });

    expect(recompute).toHaveBeenCalledTimes(1);
    expect(recompute).toHaveBeenCalledWith(withDefault);
    expect(summary.ingest).toMatchObject({ created: 1, skippedCompanies: 1 });
    expect(summary.matches).toEqual({ users: 1, ok: 1, failed: 0 });
    expect(await db.job.count()).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("Capital One: listing truncated"));
  });

  it("logs and counts a failing recompute per user without failing the run", async () => {
    const first = await userWithResume(true);
    const second = await userWithResume(true);
    const recompute = vi.fn(async (userId: string) => {
      if (userId === first) throw new Error("not implemented: recomputeMatches");
      return 2;
    });
    const logger = silentLogger();

    const summary = await runPass({
      prisma: db,
      scrape: async () => ({ json: rawRun([okCompany([])]), exitCode: 0, stderr: "" }),
      recompute,
      now: () => NOW,
      logger,
    });

    expect(recompute).toHaveBeenCalledWith(second);
    expect(summary.matches).toEqual({ users: 2, ok: 1, failed: 1 });
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining(`recomputeMatches failed for user ${first}`));
    expect(logger.error).toHaveBeenCalledWith(expect.stringContaining("not implemented: recomputeMatches"));
  });

  it("propagates scrape failures and does not recompute", async () => {
    await userWithResume(true);
    const recompute = vi.fn(async () => 0);
    await expect(
      runPass({
        prisma: db,
        scrape: async () => {
          throw new Error("scraper timed out");
        },
        recompute,
        now: () => NOW,
        logger: silentLogger(),
      }),
    ).rejects.toThrow("scraper timed out");
    expect(recompute).not.toHaveBeenCalled();
  });

  it("propagates invalid run JSON", async () => {
    await expect(
      runPass({
        prisma: db,
        scrape: async () => ({ json: { nope: true }, exitCode: 0, stderr: "" }),
        recompute: async () => 0,
        now: () => NOW,
        logger: silentLogger(),
      }),
    ).rejects.toThrow(/invalid scraper run JSON/);
  });

  it("warns when the scraper reported that every company failed", async () => {
    const logger = silentLogger();
    await runPass({
      prisma: db,
      scrape: async () => ({ json: rawRun([failedCompany("Stripe", "greenhouse")]), exitCode: 1, stderr: "all failed" }),
      recompute: async () => 0,
      now: () => NOW,
      logger,
    });
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("every company failed"));
  });
});

describe("formatSummary", () => {
  it("renders one line with the counts", () => {
    const line = formatSummary({
      startedAt: NOW,
      durationMs: 61_234,
      exitCode: 0,
      ingest: { created: 3, updated: 10, reopened: 1, closed: 2, skippedCompanies: 1, droppedPostings: 4, failures: [{ company: "Capital One", error: "x" }], companies: 6 },
      matches: { users: 2, ok: 1, failed: 1 },
    });
    expect(line).not.toContain("\n");
    expect(line).toBe(
      "[worker] run 2026-11-07T12:00:00.000Z done in 61.2s: companies 5/6 ok (failed: Capital One); jobs created 3, updated 10 (reopened 1), closed 2, dropped 4; matches 1/2 users ok, 1 failed",
    );
  });
});
