import { beforeEach, describe, expect, it, vi } from "vitest";
import { approveVersion, proposeVersion } from "@/lib/campaign";
import { db, resetDb } from "@/test/db";
import { approveRules, auditFor, baseRules, createWorld, NOW } from "./testing/fixtures";
import { resetDepMocks } from "./testing/mock-deps";

vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

const { approveWaiting, getSubmissionPacket, prepareApplication, recordSubmission, skipWaiting } = await import("./index");

// One SQLite connection serves every request in the process. These run two requests at once (a double click,
// or Muse and the web together) and check that one request's rollback never discards the other's writes.
describe("concurrent requests", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("double Prepare on a new job: one application and exactly one prepared audit", async () => {
    const world = await createWorld();
    await approveRules(world);
    const results = await Promise.allSettled([
      prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW),
      prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW),
    ]);
    expect(results.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
    expect(await db.application.count({ where: { userId: world.user.id } })).toBe(1);
    expect(await auditFor(world.user.id, "application.prepared")).toHaveLength(1);
  });

  it("double Approve on a campaign version: approved once with exactly one campaign.approved audit", async () => {
    const world = await createWorld();
    const version = await proposeVersion(world.user.id, baseRules(world), "web");
    const results = await Promise.allSettled([
      approveVersion(world.user.id, version.id, "web"),
      approveVersion(world.user.id, version.id, "web"),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual(["fulfilled", "rejected"]);
    const stored = await db.campaignVersion.findUniqueOrThrow({ where: { id: version.id } });
    expect(stored.approvedAt).not.toBeNull();
    expect(await auditFor(world.user.id, "campaign.approved")).toHaveLength(1);
  });

  it("double Skip and double Approve on a waiting application keep exactly one audit each", async () => {
    const world = await createWorld();
    await approveRules(world);
    const a = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    const b = await prepareApplication(world.user.id, world.jobs.meta.id, "user", NOW);
    await Promise.allSettled([skipWaiting(world.user.id, a.id), skipWaiting(world.user.id, a.id)]);
    await Promise.allSettled([approveWaiting(world.user.id, b.id, NOW), approveWaiting(world.user.id, b.id, NOW)]);
    expect(await auditFor(world.user.id, "application.skipped")).toHaveLength(1);
    expect(await auditFor(world.user.id, "application.approved")).toHaveLength(1);
  });

  it("double recordSubmission keeps exactly one submitted audit", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
    await getSubmissionPacket(world.user.id, app.id, NOW, "muse");
    await Promise.allSettled([
      recordSubmission(world.user.id, app.id, "muse", undefined, NOW),
      recordSubmission(world.user.id, app.id, "muse", undefined, NOW),
    ]);
    expect(await auditFor(world.user.id, "application.submitted")).toHaveLength(1);
  });

  it("a re-check never overwrites a Skip the user made meanwhile", async () => {
    const world = await createWorld();
    await approveRules(world);
    const held = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    await approveRules(world, { autoCompanies: ["Stripe", "Palantir"] });

    // Skip lands after prepare read the waiting row but before its transaction runs.
    const findUnique = db.application.findUnique.bind(db.application);
    const readThenSkip = async (args: Parameters<typeof findUnique>[0]) => {
      const row = await findUnique(args);
      await skipWaiting(world.user.id, held.id);
      return row;
    };
    const spy = vi.spyOn(db.application, "findUnique").mockImplementationOnce(readThenSkip as never);
    const result = await prepareApplication(world.user.id, world.jobs.palantir.id, "muse", NOW);
    spy.mockRestore();

    expect(result.status).toBe("skipped");
    const stored = await db.application.findUniqueOrThrow({ where: { id: held.id } });
    expect(stored).toMatchObject({ status: "skipped", decidedBy: "user" });
    expect(await getSubmissionPacket(world.user.id, held.id, NOW, "muse")).toMatchObject({ allowed: false });
  });
});
