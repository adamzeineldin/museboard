import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { db, resetDb } from "@/test/db";
import { deleteExpiredVerificationTokens } from "./auth-cleanup";

const NOW = new Date("2026-11-08T12:00:00Z");
const at = (offsetMs: number): Date => new Date(NOW.getTime() + offsetMs);

describe("deleteExpiredVerificationTokens", () => {
  beforeEach(async () => {
    await resetDb();
  });

  afterAll(async () => {
    await resetDb();
  });

  it("deletes only the sign-in links that expired before now and returns how many", async () => {
    await db.verificationToken.createMany({
      data: [
        { identifier: "a@school.edu", token: "old-1", expires: at(-24 * 60 * 60_000) },
        { identifier: "b@school.edu", token: "old-2", expires: at(-1) },
        { identifier: "c@school.edu", token: "edge", expires: NOW },
        { identifier: "d@school.edu", token: "live", expires: at(60_000) },
      ],
    });
    await expect(deleteExpiredVerificationTokens(NOW)).resolves.toBe(2);
    const left = await db.verificationToken.findMany({ orderBy: { token: "asc" } });
    expect(left.map((row) => row.token)).toEqual(["edge", "live"]);
  });

  it("returns 0 when nothing has expired", async () => {
    await expect(deleteExpiredVerificationTokens(NOW)).resolves.toBe(0);
  });
});
