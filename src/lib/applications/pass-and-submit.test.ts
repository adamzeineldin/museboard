import { beforeEach, describe, expect, it, vi } from "vitest";
import { proposeVersion, setCampaignStatus } from "@/lib/campaign";
import { db, resetDb } from "@/test/db";
import { approveRules, auditFor, baseRules, createWorld, NOW } from "./testing/fixtures";
import { bestContactAt, resetDepMocks } from "./testing/mock-deps";

vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

const { approveWaiting, getSubmissionPacket, prepareApplication, recordSubmission, runWeeklyPass, skipWaiting } =
  await import("./index");

const label = (company: string, key: string, kind = "Intern") => `${company} · ${company} SWE ${kind} ${key}`;

describe("runWeeklyPass", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("enforces the weekly cap across the pass: cap 2 with 4 eligible -> 2 prepared, 2 waiting", async () => {
    const world = await createWorld();
    await approveRules(world, { weeklyCap: 2, askFirstCompanies: [] });
    const summary = await runWeeklyPass(world.user.id, "muse", NOW);

    expect(summary).toEqual({
      submitted: [label("Stripe", "stripe"), label("Datadog", "datadog")],
      waiting: [label("Cloudflare", "cloudflare"), label("Ramp", "ramp")],
      referralDrafts: [],
    });
    const apps = await db.application.findMany({ include: { job: true } });
    expect(apps).toHaveLength(4);
    const waiting = apps.filter((a) => a.status === "waiting");
    expect(waiting.map((a) => a.reason)).toEqual(["Weekly limit reached", "Weekly limit reached"]);
    // Jobs outside the campaign (Palantir), other role types and low matches are not turned into applications.
    expect(apps.map((a) => a.jobId)).not.toContain(world.jobs.palantir.id);
    expect(apps.map((a) => a.jobId)).not.toContain(world.jobs.rampNewgrad.id);
    expect(apps.map((a) => a.jobId)).not.toContain(world.jobs.stripeLow.id);

    const [ran] = await auditFor(world.user.id, "weekly_pass.ran");
    expect(ran.actor).toBe("muse");
    expect(ran.payload).toMatchObject({ candidates: 4, summary: "Prepared 2, 2 waiting on you, 0 referral asks drafted." });
  });

  it("every application the pass prepares has an audit event with the check result", async () => {
    const world = await createWorld();
    await approveRules(world, { weeklyCap: 2 });
    await runWeeklyPass(world.user.id, "inroad", NOW);
    const apps = await db.application.findMany();
    const events = await auditFor(world.user.id, "application.prepared");
    expect(apps.length).toBe(5);
    for (const app of apps) {
      const event = events.find((e) => (e.payload as { applicationId: string }).applicationId === app.id);
      expect(event?.payload).toMatchObject({ ok: app.status === "prepared", reason: app.reason });
      expect(event?.payload).toHaveProperty("weekCount");
      expect(event?.payload).toHaveProperty("versionId");
    }
  });

  it("includes ask-first companies as waiting top choices with referral drafts", async () => {
    const world = await createWorld();
    await approveRules(world);
    const contact = await db.contact.create({
      data: { userId: world.user.id, name: "Marcus T.", role: "PE", companyId: world.companies.Meta.id, relationship: "Alum", source: "manual" },
    });
    bestContactAt.mockImplementation(async (_userId, companyId) => (companyId === contact.companyId ? contact : null));
    const summary = await runWeeklyPass(world.user.id, "muse", NOW);
    expect(summary.waiting).toEqual([label("Meta", "meta")]);
    expect(summary.referralDrafts).toEqual([label("Meta", "meta")]);
    expect(summary.submitted).toHaveLength(4);

    // A second pass finds nothing new.
    expect(await runWeeklyPass(world.user.id, "muse", NOW)).toEqual({ submitted: [], waiting: [], referralDrafts: [] });
  });

  it("edited but not re-approved: the pass keeps using the approved version", async () => {
    const world = await createWorld();
    const v1 = await approveRules(world, { askFirstCompanies: [] });
    await proposeVersion(world.user.id, baseRules(world, { autoCompanies: ["Stripe"], askFirstCompanies: [] }), "muse");
    const summary = await runWeeklyPass(world.user.id, "muse", NOW);
    expect(summary.submitted).toContain(label("Datadog", "datadog"));
    const datadog = await db.application.findFirstOrThrow({ where: { jobId: world.jobs.datadog.id } });
    expect(datadog).toMatchObject({ status: "prepared", campaignVersionId: v1.id });
    expect((datadog.checkResult as { versionId: string }).versionId).toBe(v1.id);
  });

  it("does nothing while the campaign is paused, revoked or missing", async () => {
    const world = await createWorld();
    expect(await runWeeklyPass(world.user.id, "user", NOW)).toEqual({
      submitted: [],
      waiting: [],
      referralDrafts: [],
      reason: "No approved campaign yet",
    });
    await approveRules(world);
    await setCampaignStatus(world.user.id, "paused");
    expect((await runWeeklyPass(world.user.id, "user", NOW)).reason).toBe("Campaign is paused");
    await setCampaignStatus(world.user.id, "revoked");
    expect((await runWeeklyPass(world.user.id, "user", NOW)).reason).toBe("Campaign is paused");
    expect(await db.application.count()).toBe(0);
    expect(await auditFor(world.user.id, "weekly_pass.ran")).toHaveLength(3);
  });

  it("does nothing after the campaign's end date", async () => {
    const world = await createWorld();
    // Approved on the fixed test clock, so this keeps passing after 2026-12-15 in real time.
    await approveRules(world, { endsOn: "2026-12-15" }, NOW);
    expect((await runWeeklyPass(world.user.id, "user", new Date("2026-12-16T12:00:00Z"))).reason).toBe("Campaign has ended");
  });

  it("skips a posting that closed mid-pass without counting it as failed", async () => {
    const world = await createWorld();
    await approveRules(world, { askFirstCompanies: [] });
    const original = db.job.findUnique.bind(db.job);
    const spy = vi.spyOn(db.job, "findUnique").mockImplementationOnce((async (args: Parameters<typeof db.job.findUnique>[0]) => {
      await db.job.update({ where: { id: world.jobs.stripe.id }, data: { closedAt: NOW } });
      return original(args);
    }) as unknown as typeof db.job.findUnique);
    vi.mocked(console.error).mockClear();
    try {
      const summary = await runWeeklyPass(world.user.id, "inroad", NOW);
      expect(summary.failed).toBeUndefined();
      expect(summary.submitted).not.toContain(label("Stripe", "stripe"));
      expect(console.error).not.toHaveBeenCalled();
      const [blocked] = await auditFor(world.user.id, "application.blocked");
      expect(blocked.payload).toMatchObject({ jobId: world.jobs.stripe.id, reason: "This posting has closed." });
    } finally {
      spy.mockRestore();
    }
  });

  it("matches campaign companies the way company names are compared (runs of spaces collapse)", async () => {
    const world = await createWorld();
    await db.company.update({ where: { id: world.companies.Datadog.id }, data: { name: "Data Dog" } });
    await approveRules(world, { autoCompanies: ["Data  Dog"], askFirstCompanies: [] });
    const summary = await runWeeklyPass(world.user.id, "inroad", NOW);
    expect(summary.submitted).toEqual(["Data Dog · Datadog SWE Intern datadog"]);
  });

  it("stops with a clear reason when the user has no resume", async () => {
    const world = await createWorld();
    await approveRules(world);
    await db.resume.deleteMany();
    expect((await runWeeklyPass(world.user.id, "user", NOW)).reason).toBe("Upload a resume first");
  });
});

describe("approveWaiting / skipWaiting", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("approve: waiting -> prepared by the user, with a packet; skip: waiting -> skipped", async () => {
    const world = await createWorld();
    await approveRules(world);
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    const approved = await approveWaiting(world.user.id, held.id);
    expect(approved).toMatchObject({ status: "prepared", decidedBy: "user", reason: "Approved by you" });
    expect(approved.packet).not.toBeNull();
    expect(await approveWaiting(world.user.id, held.id)).toEqual(approved);
    await expect(skipWaiting(world.user.id, held.id)).rejects.toThrow("Only applications waiting on you can be skipped.");

    const other = await prepareApplication(world.user.id, world.jobs.meta.id, "user", NOW);
    const skipped = await skipWaiting(world.user.id, other.id);
    expect(skipped).toMatchObject({ status: "skipped", decidedBy: "user", reason: "Skipped by you" });
    expect(await skipWaiting(world.user.id, other.id)).toEqual(skipped);
    await expect(approveWaiting(world.user.id, other.id)).rejects.toThrow("Only applications waiting on you can be approved.");
    expect((await auditFor(world.user.id, "application.approved"))[0].payload).toMatchObject({
      previousReason: "Not on your company list",
    });
    expect(await auditFor(world.user.id, "application.skipped")).toHaveLength(1);
  });

  it("stamps decidedAt with the clock it is given", async () => {
    const world = await createWorld();
    await approveRules(world);
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    expect((await skipWaiting(world.user.id, held.id, NOW)).decidedAt).toEqual(NOW);
  });

  it("never touches another user's application", async () => {
    const world = await createWorld();
    const stranger = await createWorld();
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    await expect(approveWaiting(stranger.user.id, held.id)).rejects.toThrow("We couldn't find that application.");
    await expect(skipWaiting(stranger.user.id, held.id)).rejects.toThrow("We couldn't find that application.");
    await expect(approveWaiting(world.user.id, "")).rejects.toThrow("We couldn't find that application.");
  });
});

describe("getSubmissionPacket", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("releases the packet for a prepared application that still fits", async () => {
    const world = await createWorld();
    await approveRules(world, { weeklyCap: 1 });
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    // Cap 1 is used by this very application; it is excluded from the re-check.
    const result = await getSubmissionPacket(world.user.id, app.id, NOW, "muse");
    expect(result).toMatchObject({ allowed: true, applyUrl: world.jobs.stripe.url, packet: { role: { company: "Stripe" } } });
    const [event] = await auditFor(world.user.id, "application.packet_requested");
    expect(event).toMatchObject({ actor: "muse", payload: { applicationId: app.id, allowed: true } });
  });

  it("refuses a waiting application", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.meta.id, "muse", NOW);
    expect(await getSubmissionPacket(world.user.id, app.id, NOW)).toEqual({
      allowed: false,
      reason: "Waiting on your approval: Top choice: referral first",
    });
    const [event] = await auditFor(world.user.id, "application.packet_requested");
    expect(event.payload).toMatchObject({ allowed: false });
  });

  it("refuses a prepared application whose campaign was paused since", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    await setCampaignStatus(world.user.id, "paused");
    expect(await getSubmissionPacket(world.user.id, app.id, NOW)).toEqual({ allowed: false, reason: "Campaign is paused" });
  });

  it("refuses when the approved rules changed so the job no longer fits", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.datadog.id, "muse", NOW);
    await approveRules(world, { minMatch: 90 });
    expect(await getSubmissionPacket(world.user.id, app.id, NOW)).toEqual({ allowed: false, reason: "Match below 90%" });
  });

  it("allows an application the user approved even when the rules now fail", async () => {
    const world = await createWorld();
    await approveRules(world);
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    await approveWaiting(world.user.id, held.id);
    await setCampaignStatus(world.user.id, "paused");
    const result = await getSubmissionPacket(world.user.id, held.id, NOW);
    expect(result).toMatchObject({ allowed: true, applyUrl: world.jobs.palantir.url });
  });

  it("rebuilds a missing packet, and refuses submitted, skipped and unknown applications", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    await db.$executeRawUnsafe(`UPDATE "Application" SET "packet" = NULL WHERE "id" = ?`, app.id);
    expect(await getSubmissionPacket(world.user.id, app.id, NOW)).toMatchObject({ allowed: true, packet: { applyUrl: world.jobs.stripe.url } });

    await recordSubmission(world.user.id, app.id, "muse");
    expect(await getSubmissionPacket(world.user.id, app.id, NOW)).toEqual({ allowed: false, reason: "Already submitted." });
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    await skipWaiting(world.user.id, held.id);
    expect(await getSubmissionPacket(world.user.id, held.id, NOW)).toEqual({ allowed: false, reason: "You skipped this application." });
    const stranger = await createWorld();
    expect(await getSubmissionPacket(stranger.user.id, app.id, NOW)).toEqual({
      allowed: false,
      reason: "We couldn't find that application.",
    });
    expect(await auditFor(stranger.user.id, "application.packet_requested")).toHaveLength(1);
  });
});

describe("recordSubmission", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("moves prepared -> submitted, stores the trimmed confirmation, and is idempotent", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    const submitted = await recordSubmission(world.user.id, app.id, "muse", "  Confirmation #123  ");
    expect(submitted).toMatchObject({ status: "submitted", confirmationText: "Confirmation #123" });
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(await recordSubmission(world.user.id, app.id, "user", "again")).toEqual(submitted);
    const events = await auditFor(world.user.id, "application.submitted");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: "muse", payload: { hasConfirmation: true } });
  });

  it("stamps submittedAt with the clock its gate used, so the row counts in that week", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    const submitted = await recordSubmission(world.user.id, app.id, "muse", undefined, NOW);
    expect(submitted.submittedAt).toEqual(NOW);
  });

  it("stores no confirmation when it is blank", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    expect((await recordSubmission(world.user.id, app.id, "user", "   ")).confirmationText).toBeNull();
  });

  it("refuses waiting applications, oversized confirmations and other users", async () => {
    const world = await createWorld();
    await approveRules(world);
    const held = await prepareApplication(world.user.id, world.jobs.meta.id, "muse", NOW);
    await expect(recordSubmission(world.user.id, held.id, "muse")).rejects.toMatchObject({
      code: "not_released",
      reason: "Waiting on your approval: Top choice: referral first",
    });
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    await expect(recordSubmission(world.user.id, app.id, "muse", "x".repeat(2001))).rejects.toThrow(
      "Keep the confirmation under 2000 characters.",
    );
    const stranger = await createWorld();
    await expect(recordSubmission(stranger.user.id, app.id, "muse")).rejects.toThrow("We couldn't find that application.");
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).status).toBe("prepared");
  });
});
