import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { approveRules, createWorld, NOW, type World } from "@/lib/applications/testing/fixtures";
import { db, resetDb } from "@/test/db";

const { getSessionUserId, revalidatePath } = vi.hoisted(() => ({ getSessionUserId: vi.fn(), revalidatePath: vi.fn() }));

vi.mock("@/lib/current-user", () => ({ getSessionUserId }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/applications/deps", async () => (await import("@/lib/applications/testing/mock-deps")).mockDeps);

const { approveApplicationAction, markSubmittedAction, runWeeklyPassAction, skipApplicationAction } = await import("./actions");

const appFor = (world: World, key: string) =>
  db.application.findUniqueOrThrow({ where: { userId_jobId: { userId: world.user.id, jobId: world.jobs[key].id } } });

describe("activity actions", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("refuses every action without a session", async () => {
    getSessionUserId.mockResolvedValue(null);
    const signedOut = { ok: false, message: "Your session ended. Sign in again." };
    expect(await runWeeklyPassAction()).toEqual(signedOut);
    expect(await approveApplicationAction("x")).toEqual(signedOut);
    expect(await markSubmittedAction("x")).toEqual(signedOut);
  });

  it("over cap after a user approval: Mark as submitted is refused for the held row, like getSubmissionPacket", async () => {
    const world = await createWorld();
    getSessionUserId.mockResolvedValue(world.user.id);
    await approveRules(world, { weeklyCap: 2, askFirstCompanies: [] });

    expect(await runWeeklyPassAction()).toEqual({ ok: true, message: "Prepared 2. 2 waiting on you." });
    const cloudflare = await appFor(world, "cloudflare");
    expect(await approveApplicationAction(cloudflare.id)).toEqual({ ok: true, message: "Approved. It's ready to submit." });

    const datadog = await appFor(world, "datadog");
    expect(await markSubmittedAction(datadog.id)).toEqual({
      ok: false,
      message: "Not released: Weekly limit reached. Nothing was changed.",
    });
    expect((await appFor(world, "datadog")).status).toBe("prepared");

    const stripe = await appFor(world, "stripe");
    expect(await markSubmittedAction(stripe.id)).toEqual({ ok: true, message: "Marked as submitted" });
    expect(await markSubmittedAction(cloudflare.id)).toEqual({ ok: true, message: "Marked as submitted" });
    expect(revalidatePath).toHaveBeenCalledWith("/activity");
  });

  it("skips a waiting row and rejects bad ids and long confirmations", async () => {
    const world = await createWorld();
    getSessionUserId.mockResolvedValue(world.user.id);
    await approveRules(world, { weeklyCap: 2, askFirstCompanies: [] });
    await runWeeklyPassAction();
    const ramp = await appFor(world, "ramp");
    expect(await skipApplicationAction(ramp.id)).toEqual({ ok: true, message: "Skipped" });
    expect(await approveApplicationAction("")).toEqual({ ok: false, message: "We couldn't find that application." });
    expect(await markSubmittedAction(ramp.id, "x".repeat(5000))).toEqual({ ok: false, message: "That confirmation is too long." });
    expect(await markSubmittedAction(ramp.id)).toEqual({
      ok: false,
      message: "Not released: You skipped this application. Nothing was changed.",
    });
  });
});
