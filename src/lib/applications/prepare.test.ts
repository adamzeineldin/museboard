import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCampaignStatus, proposeVersion } from "@/lib/campaign";
import { parseApplicationPacket } from "@/lib/packet-types";
import { db, resetDb } from "@/test/db";
import { approveRules, auditFor, baseRules, createWorld, NOW } from "./testing/fixtures";
import { bestContactAt, createReferralAskDraft, FIT_LINES, resetDepMocks } from "./testing/mock-deps";

vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

const { ApplicationError, evaluateJobForUser, prepareApplication } = await import("./index");

describe("prepareApplication", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("prepares a job that fits the rules, with packet, check result and audit entry", async () => {
    const world = await createWorld();
    const version = await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);

    expect(app).toMatchObject({
      status: "prepared",
      decidedBy: "campaign",
      reason: "Fits campaign rules",
      decidedAt: NOW,
      campaignVersionId: version.id,
      resumeId: world.resume.id,
    });
    expect(app.checkResult).toEqual({
      ok: true,
      reason: "Fits campaign rules",
      topChoice: false,
      versionId: version.id,
      weekCount: 0,
      score: 91,
    });
    const packet = parseApplicationPacket(app.packet);
    expect(packet).toMatchObject({
      applyUrl: world.jobs.stripe.url,
      role: { jobId: world.jobs.stripe.id, company: "Stripe" },
      fitSummary: FIT_LINES,
      resume: { id: world.resume.id, filename: "Resume_v3.pdf", downloadPath: `/api/resumes/${world.resume.id}` },
      answers: { fullName: "Ada Lovelace", email: world.user.email, school: "Test University", gradYear: 2027 },
    });
    expect(packet?.notes.some((note) => note.startsWith("Work authorization"))).toBe(true);

    const [event] = await auditFor(world.user.id, "application.prepared");
    expect(event.actor).toBe("muse");
    expect(event.payload).toMatchObject({ applicationId: app.id, ok: true, reason: "Fits campaign rules", versionId: version.id });
  });

  it("holds a job outside the rules as waiting with the failing reason", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    expect(app).toMatchObject({ status: "waiting", reason: "Not on your company list", decidedAt: null, packet: null });
    const [event] = await auditFor(world.user.id, "application.prepared");
    expect(event.payload).toMatchObject({ ok: false, reason: "Not on your company list", status: "waiting" });
  });

  it("holds every job when no campaign is approved yet, using the default resume", async () => {
    const world = await createWorld();
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW);
    expect(app).toMatchObject({ status: "waiting", reason: "No approved campaign yet", campaignVersionId: null });
    expect(app.resumeId).toBe(world.resume.id);
  });

  it("holds jobs while paused or revoked", async () => {
    const world = await createWorld();
    await approveRules(world);
    await setCampaignStatus(world.user.id, "paused");
    expect((await prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW)).reason).toBe("Campaign is paused");
    await setCampaignStatus(world.user.id, "revoked");
    expect((await prepareApplication(world.user.id, world.jobs.datadog.id, "user", NOW)).reason).toBe("Campaign is paused");
  });

  it("top choice: waits and drafts a referral ask for the best contact", async () => {
    const world = await createWorld();
    await approveRules(world);
    const contact = await db.contact.create({
      data: { userId: world.user.id, name: "Marcus T.", role: "PE", companyId: world.companies.Meta.id, relationship: "Alum", source: "manual" },
    });
    bestContactAt.mockResolvedValue(contact);

    const app = await prepareApplication(world.user.id, world.jobs.meta.id, "muse", NOW);
    expect(app).toMatchObject({ status: "waiting", reason: "Top choice: referral first" });
    expect((app.checkResult as { topChoice: boolean }).topChoice).toBe(true);
    expect(bestContactAt).toHaveBeenCalledWith(world.user.id, world.companies.Meta.id);
    expect(createReferralAskDraft).toHaveBeenCalledWith(world.user.id, contact.id, world.jobs.meta.id, "muse");
    expect(await db.outreach.count({ where: { userId: world.user.id, kind: "referral_ask" } })).toBe(1);
    const [drafted] = await auditFor(world.user.id, "application.referral_drafted");
    expect(drafted.payload).toMatchObject({ applicationId: app.id, contactId: contact.id });
  });

  it("top choice: does not draft twice for the same contact and job, or when there is no contact", async () => {
    const world = await createWorld();
    await approveRules(world);
    await prepareApplication(world.user.id, world.jobs.meta.id, "user", NOW);
    expect(createReferralAskDraft).not.toHaveBeenCalled();

    await db.application.deleteMany();
    const contact = await db.contact.create({
      data: { userId: world.user.id, name: "Marcus T.", role: "PE", companyId: world.companies.Meta.id, relationship: "Alum", source: "manual" },
    });
    await db.outreach.create({
      data: { userId: world.user.id, contactId: contact.id, jobId: world.jobs.meta.id, companyId: contact.companyId, kind: "referral_ask", draft: "x" },
    });
    bestContactAt.mockResolvedValue(contact);
    await prepareApplication(world.user.id, world.jobs.meta.id, "user", NOW);
    expect(createReferralAskDraft).not.toHaveBeenCalled();
  });

  it("top choice: a failed draft is logged and audited, and the application is kept", async () => {
    const world = await createWorld();
    await approveRules(world);
    bestContactAt.mockRejectedValue(new Error("boom"));
    const app = await prepareApplication(world.user.id, world.jobs.meta.id, "user", NOW);
    expect(app.status).toBe("waiting");
    expect(await auditFor(world.user.id, "application.referral_draft_failed")).toHaveLength(1);
  });

  it("is idempotent per user and job", async () => {
    const world = await createWorld();
    await approveRules(world);
    const first = await prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW);
    const second = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    expect(second).toEqual(first);
    expect(await db.application.count()).toBe(1);
    expect(await auditFor(world.user.id, "application.prepared")).toHaveLength(1);
  });

  it("moves a waiting application to prepared once the approved rules let it through", async () => {
    const world = await createWorld();
    await approveRules(world);
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    expect(held.status).toBe("waiting");

    // Still failing: unchanged, no new audit entry.
    expect(await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW)).toEqual(held);
    // A pending edit changes nothing.
    await proposeVersion(world.user.id, baseRules(world, { autoCompanies: ["Stripe", "Palantir"] }), "muse");
    expect((await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW)).status).toBe("waiting");

    const v2 = await approveRules(world, { autoCompanies: ["Stripe", "Palantir"] });
    const promoted = await prepareApplication(world.user.id, world.jobs.palantir.id, "inroad", NOW);
    expect(promoted).toMatchObject({ id: held.id, status: "prepared", decidedBy: "campaign", campaignVersionId: v2.id });
    expect(parseApplicationPacket(promoted.packet)).not.toBeNull();
    const events = await auditFor(world.user.id, "application.prepared");
    expect(events.map((e) => (e.payload as { recheck: boolean }).recheck)).toEqual([false, true]);
  });

  it("returns a prepared, submitted or skipped application unchanged", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    await db.application.update({ where: { id: app.id }, data: { status: "skipped" } });
    expect((await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW)).status).toBe("skipped");
  });

  it("uses the default resume when the campaign's resume no longer exists", async () => {
    const world = await createWorld();
    const spare = await db.resume.create({ data: { userId: world.user.id, filename: "old.pdf", storageKey: "s" } });
    await approveRules(world, { resumeId: spare.id });
    await db.resume.delete({ where: { id: spare.id } });
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW);
    expect(app.resumeId).toBe(world.resume.id);
  });

  it("refuses without a resume, auditing the reason", async () => {
    const world = await createWorld({ withResume: false });
    const error = await prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApplicationError);
    expect((error as Error).message).toBe("Upload a resume first");
    const [event] = await auditFor(world.user.id, "application.blocked");
    expect(event.payload).toMatchObject({ ok: false, reason: "Upload a resume first", jobId: world.jobs.stripe.id });
  });

  it("rejects unknown jobs, closed postings and bad actors", async () => {
    const world = await createWorld({ jobs: [{ key: "closed", company: "Stripe", score: 90, closed: true }] });
    await expect(prepareApplication(world.user.id, "nope", "user", NOW)).rejects.toThrow("We couldn't find that job.");
    await expect(prepareApplication(world.user.id, world.jobs.closed.id, "user", NOW)).rejects.toThrow("This posting has closed.");
    // @ts-expect-error runtime validation
    await expect(prepareApplication(world.user.id, world.jobs.closed.id, "system", NOW)).rejects.toThrow("Unknown actor.");
  });
});

describe("evaluateJobForUser", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("runs the rule check without writing anything", async () => {
    const world = await createWorld();
    await approveRules(world, { minMatch: 85 });
    expect(await evaluateJobForUser(world.user.id, world.jobs.stripe.id, NOW)).toEqual({ ok: true, reason: "Fits campaign rules" });
    expect(await evaluateJobForUser(world.user.id, world.jobs.datadog.id, NOW)).toEqual({ ok: false, reason: "Match below 85%" });
    expect(await evaluateJobForUser(world.user.id, world.jobs.meta.id, NOW)).toEqual({
      ok: false,
      reason: "Top choice: referral first",
      topChoice: true,
    });
    expect(await evaluateJobForUser(world.user.id, world.jobs.rampNewgrad.id, NOW)).toMatchObject({ reason: "Role type not in campaign" });
    expect(await db.application.count()).toBe(0);
    expect(bestContactAt).not.toHaveBeenCalled();
  });
});
