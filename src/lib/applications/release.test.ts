import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCampaignStatus } from "@/lib/campaign";
import { db, resetDb } from "@/test/db";
import { approveRules, auditFor, createWorld, NOW, type World } from "./testing/fixtures";
import { resetDepMocks } from "./testing/mock-deps";

vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

const { approveWaiting, checkRelease, getActivity, getReleaseVerdicts, getSubmissionPacket, recordSubmission, runWeeklyPass } =
  await import("./index");

const appFor = (world: World, key: string) =>
  db.application.findUniqueOrThrow({ where: { userId_jobId: { userId: world.user.id, jobId: world.jobs[key].id } } });

const LIMIT = { allowed: false, reason: "Weekly limit reached" };
const FITS = { allowed: true, reason: "Fits campaign rules" };
const BY_YOU = { allowed: true, reason: "Approved by you" };

/** Walk-through: cap 2, the pass prepares Stripe + Datadog, Cloudflare + Ramp wait; the user approves Cloudflare. */
async function overCapWorld() {
  const world = await createWorld();
  await approveRules(world, { weeklyCap: 2, askFirstCompanies: [] });
  await runWeeklyPass(world.user.id, "inroad", NOW);
  const [stripe, datadog, cloudflare] = await Promise.all([appFor(world, "stripe"), appFor(world, "datadog"), appFor(world, "cloudflare")]);
  await approveWaiting(world.user.id, cloudflare.id, NOW);
  return { world, stripe, datadog, cloudflare };
}

describe("release check (web and Muse parity)", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("refuses to release or approve applications whose posting has closed", async () => {
    const world = await createWorld();
    await approveRules(world);
    await runWeeklyPass(world.user.id, "inroad", NOW);
    const [stripe, meta] = await Promise.all([appFor(world, "stripe"), appFor(world, "meta")]);
    await db.job.updateMany({ where: { id: { in: [world.jobs.stripe.id, world.jobs.meta.id] } }, data: { closedAt: NOW } });

    const closed = { allowed: false, reason: "This posting has closed." };
    expect(await getSubmissionPacket(world.user.id, stripe.id, NOW, "muse")).toEqual(closed);
    expect(await checkRelease(world.user.id, stripe.id, NOW)).toEqual(closed);
    expect((await getReleaseVerdicts(world.user.id, NOW)).get(stripe.id)).toEqual(closed);
    await expect(approveWaiting(world.user.id, meta.id, NOW)).rejects.toThrow("This posting has closed.");
    expect((await appFor(world, "meta")).status).toBe("waiting");
  });

  it("a user-approved application is not released once its posting closes", async () => {
    const world = await createWorld();
    await approveRules(world);
    await runWeeklyPass(world.user.id, "inroad", NOW);
    const meta = await appFor(world, "meta");
    await approveWaiting(world.user.id, meta.id, NOW);
    await db.job.update({ where: { id: world.jobs.meta.id }, data: { closedAt: NOW } });
    expect(await getSubmissionPacket(world.user.id, meta.id, NOW, "muse")).toEqual({ allowed: false, reason: "This posting has closed." });
  });

  it("over cap after a user approval: one campaign-prepared row is held with 'Weekly limit reached'", async () => {
    const { world, stripe, datadog, cloudflare } = await overCapWorld();
    const verdicts = await getReleaseVerdicts(world.user.id, NOW);

    expect(verdicts.get(stripe.id)).toEqual(FITS);
    expect(verdicts.get(datadog.id)).toEqual(LIMIT);
    expect(verdicts.get(cloudflare.id)).toEqual(BY_YOU);
    expect(verdicts.size).toBe(3);

    // Muse gets the same verdicts from getSubmissionPacket.
    expect(await getSubmissionPacket(world.user.id, stripe.id, NOW, "muse")).toMatchObject({ allowed: true });
    expect(await getSubmissionPacket(world.user.id, datadog.id, NOW, "muse")).toEqual(LIMIT);
    expect(await getSubmissionPacket(world.user.id, cloudflare.id, NOW, "muse")).toMatchObject({ allowed: true });
  });

  it("reading verdicts writes no audit events (only getSubmissionPacket audits)", async () => {
    const { world, datadog } = await overCapWorld();
    await getReleaseVerdicts(world.user.id, NOW);
    expect(await checkRelease(world.user.id, datadog.id, NOW)).toEqual(LIMIT);
    expect(await auditFor(world.user.id, "application.packet_requested")).toHaveLength(0);
  });

  it("getActivity attaches the verdict to prepared rows only", async () => {
    const { world, datadog, stripe } = await overCapWorld();
    const activity = await getActivity(world.user.id, world.user.timezone, NOW);
    const byId = new Map(activity.items.map((item) => [item.id, item]));
    expect(byId.get(datadog.id)?.release).toEqual(LIMIT);
    expect(byId.get(stripe.id)?.release).toEqual(FITS);
    const ramp = await appFor(world, "ramp");
    expect(byId.get(ramp.id)?.release).toBeNull();
  });

  it("getActivity marks rows whose packet Muse already received", async () => {
    const { world, datadog, stripe } = await overCapWorld();
    expect((await getSubmissionPacket(world.user.id, stripe.id, NOW, "muse")).allowed).toBe(true);
    await setCampaignStatus(world.user.id, "paused");
    const activity = await getActivity(world.user.id, world.user.timezone, NOW);
    const byId = new Map(activity.items.map((item) => [item.id, item]));
    expect(byId.get(stripe.id)).toMatchObject({ packetReleased: true, release: { allowed: false, reason: "Campaign is paused" } });
    expect(byId.get(datadog.id)?.packetReleased).toBe(false);
  });

  it("a submitted row still counts: the held row stays held after the other one is submitted", async () => {
    const { world, stripe, datadog } = await overCapWorld();
    await recordSubmission(world.user.id, stripe.id, "user");
    // recordSubmission stamps the wall clock; move it into the fixed test week.
    await db.application.update({ where: { id: stripe.id }, data: { submittedAt: NOW } });
    expect(await checkRelease(world.user.id, datadog.id, NOW)).toEqual(LIMIT);
  });

  it("the cap frees up next week", async () => {
    const { world, datadog } = await overCapWorld();
    const nextWeek = new Date(NOW.getTime() + 7 * 24 * 60 * 60 * 1000);
    expect(await checkRelease(world.user.id, datadog.id, nextWeek)).toEqual(FITS);
  });

  it("pausing holds every campaign-prepared row but not the user-approved one", async () => {
    const { world, stripe, cloudflare } = await overCapWorld();
    await setCampaignStatus(world.user.id, "paused");
    const verdicts = await getReleaseVerdicts(world.user.id, NOW);
    expect(verdicts.get(stripe.id)).toEqual({ allowed: false, reason: "Campaign is paused" });
    expect(verdicts.get(cloudflare.id)).toEqual(BY_YOU);
  });

  it("checkRelease refuses rows that are not prepared and rows of other users", async () => {
    const { world, stripe } = await overCapWorld();
    const ramp = await appFor(world, "ramp");
    expect(await checkRelease(world.user.id, ramp.id, NOW)).toEqual({
      allowed: false,
      reason: "Waiting on your approval: Weekly limit reached",
    });
    const stranger = await createWorld();
    expect(await checkRelease(stranger.user.id, stripe.id, NOW)).toEqual({
      allowed: false,
      reason: "We couldn't find that application.",
    });
  });
});
