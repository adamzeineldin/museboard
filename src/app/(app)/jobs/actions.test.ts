import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";

const { getSessionUserId, prepareApplication, revalidatePath } = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
  prepareApplication: vi.fn(),
  revalidatePath: vi.fn(),
}));

class FakeApplicationError extends Error {}

vi.mock("@/lib/current-user", () => ({ getSessionUserId }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/applications", () => ({
  prepareApplication,
  isApplicationError: (e: unknown) => e instanceof FakeApplicationError,
}));

import { prepareJobAction } from "./actions";
import { prepareMessage } from "./prepare-message";

async function seedJob(closed = false) {
  const company = await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
  return db.job.create({
    data: {
      id: "gh:stripe:1",
      companyId: company.id,
      title: "SWE Intern",
      location: "NYC",
      type: "intern",
      url: "https://x",
      source: "Greenhouse feed",
      closedAt: closed ? new Date() : null,
    },
  });
}

describe("prepareJobAction", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("prepares with the session user (actor 'user') and revalidates", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    await seedJob();
    prepareApplication.mockResolvedValue({ status: "prepared", reason: "Fits campaign rules" });
    const result = await prepareJobAction("gh:stripe:1");
    expect(prepareApplication).toHaveBeenCalledWith(user.id, "gh:stripe:1", "user");
    expect(result).toEqual({ ok: true, status: "prepared", message: "Prepared SWE Intern at Stripe. It's ready to submit from Activity." });
    expect(revalidatePath).toHaveBeenCalledWith("/jobs");
    expect(revalidatePath).toHaveBeenCalledWith("/activity");
  });

  it("reports a held application with its reason", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    await seedJob();
    prepareApplication.mockResolvedValue({ status: "waiting", reason: "Top choice: referral first" });
    const result = await prepareJobAction("gh:stripe:1");
    expect(result).toMatchObject({ ok: true, status: "waiting", message: expect.stringMatching(/^Held for you: Top choice: referral first\./) });
  });

  it("refuses without a session, with a bad id, for unknown or closed jobs", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect(await prepareJobAction("x")).toMatchObject({ ok: false, message: expect.stringMatching(/Sign in/) });

    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    expect(await prepareJobAction({ id: "x" })).toMatchObject({ ok: false });
    expect(await prepareJobAction("missing")).toEqual({ ok: false, message: "That job is no longer listed." });
    await seedJob(true);
    expect(await prepareJobAction("gh:stripe:1")).toMatchObject({ ok: false, message: expect.stringMatching(/closed/) });
    expect(prepareApplication).not.toHaveBeenCalled();
  });

  it("passes application errors through and hides unexpected ones", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    await seedJob();
    prepareApplication.mockRejectedValueOnce(new FakeApplicationError("Upload a resume first"));
    expect(await prepareJobAction("gh:stripe:1")).toEqual({ ok: false, message: "Upload a resume first" });

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    prepareApplication.mockRejectedValueOnce(new Error("SQLITE_BUSY"));
    const result = await prepareJobAction("gh:stripe:1");
    expect(result).toEqual({ ok: false, message: "We couldn't prepare that application. Try again in a moment." });
    errorSpy.mockRestore();
  });
});

describe("prepareMessage", () => {
  it.each([
    ["submitted", /already applied/],
    ["skipped", /skipped/],
    ["weird", /See Activity/],
  ])("%s", (status, pattern) => {
    expect(prepareMessage({ status, reason: "", title: "T", companyName: "C" })).toMatch(pattern);
  });

  it("says a skipped job stays skipped instead of promising an undo in Activity", () => {
    expect(prepareMessage({ status: "skipped", reason: "", title: "T", companyName: "C" })).toBe("You skipped T at C. Inroad won't prepare it.");
  });
});
