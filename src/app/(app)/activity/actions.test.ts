import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSubmissionPacket, prepareApplication } from "@/lib/applications";
import { approveRules, auditFor, createWorld, NOW, type World } from "@/lib/applications/testing/fixtures";
import { setCampaignStatus } from "@/lib/campaign";
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
    expect(await skipApplicationAction("x")).toEqual(signedOut);
    expect(await markSubmittedAction("x")).toEqual(signedOut);
  });

  it("takes the user from the session: another user's application ids are not found and nothing changes", async () => {
    const owner = await createWorld();
    const stranger = await createWorld();
    await approveRules(owner, { weeklyCap: 2, askFirstCompanies: [] });
    getSessionUserId.mockResolvedValue(owner.user.id);
    await runWeeklyPassAction();
    const waiting = await appFor(owner, "ramp");
    const prepared = await appFor(owner, "stripe");
    expect([waiting.status, prepared.status]).toEqual(["waiting", "prepared"]);
    const before = await db.application.findMany({ where: { userId: owner.user.id }, orderBy: { id: "asc" } });

    getSessionUserId.mockResolvedValue(stranger.user.id);
    const notFound = { ok: false, message: "We couldn't find that application." };
    expect(await approveApplicationAction(waiting.id)).toEqual(notFound);
    expect(await skipApplicationAction(waiting.id)).toEqual(notFound);
    expect(await markSubmittedAction(prepared.id)).toEqual(notFound);

    expect(await db.application.findMany({ where: { userId: owner.user.id }, orderBy: { id: "asc" } })).toEqual(before);
    expect(await db.auditEvent.count({ where: { userId: stranger.user.id } })).toBe(0);
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

  it("Mark as submitted goes through the service's release gate: a never-released held row is refused and audited", async () => {
    const world = await createWorld();
    getSessionUserId.mockResolvedValue(world.user.id);
    await approveRules(world, { askFirstCompanies: [] });
    const stripe = await prepareApplication(world.user.id, world.jobs.stripe.id, "inroad", NOW);
    const datadog = await prepareApplication(world.user.id, world.jobs.datadog.id, "inroad", NOW);
    // Muse got Datadog's packet while the campaign was active.
    expect((await getSubmissionPacket(world.user.id, datadog.id, NOW, "muse")).allowed).toBe(true);
    await setCampaignStatus(world.user.id, "paused");

    expect(await markSubmittedAction(stripe.id)).toEqual({ ok: false, message: "Not released: Campaign is paused. Nothing was changed." });
    expect((await appFor(world, "stripe")).status).toBe("prepared");
    const [refused] = await auditFor(world.user.id, "application.record_refused");
    expect(refused).toMatchObject({ actor: "user", payload: { applicationId: stripe.id, reason: "Campaign is paused" } });

    // A released packet records a true event even though the campaign is paused now.
    expect(await markSubmittedAction(datadog.id, "Ref 7")).toEqual({ ok: true, message: "Marked as submitted" });
    expect((await appFor(world, "datadog")).status).toBe("submitted");
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
