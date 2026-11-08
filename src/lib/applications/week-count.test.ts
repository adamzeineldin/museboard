import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/test/db";
import { approveRules, createWorld, NOW, type World } from "./testing/fixtures";
import { resetDepMocks } from "./testing/mock-deps";

vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

const { getActivity, weekCount } = await import("./index");

async function addApp(world: World, jobKey: string, data: { status: string; submittedAt?: Date; decidedAt?: Date }) {
  return db.application.create({
    data: {
      userId: world.user.id,
      jobId: world.jobs[jobKey].id,
      resumeId: world.resume.id,
      decidedBy: "campaign",
      reason: "Fits campaign rules",
      ...data,
    },
  });
}

describe("weekCount", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("counts submitted and prepared applications in the user's ISO week (Monday 00:00 local)", async () => {
    const world = await createWorld();
    // Monday 2026-11-09 00:00 in New York is 05:00Z.
    await addApp(world, "stripe", { status: "submitted", submittedAt: new Date("2026-11-09T04:30:00Z") }); // Sunday night NY
    await addApp(world, "datadog", { status: "submitted", submittedAt: new Date("2026-11-09T05:30:00Z") });
    await addApp(world, "cloudflare", { status: "prepared", decidedAt: new Date("2026-11-10T12:00:00Z") });
    await addApp(world, "ramp", { status: "waiting" });
    await addApp(world, "palantir", { status: "skipped", decidedAt: new Date("2026-11-10T12:00:00Z") });

    expect(await weekCount(world.user.id, NOW, "America/New_York")).toBe(2);
    // In UTC the Sunday-night submission falls in the same week.
    expect(await weekCount(world.user.id, NOW, "UTC")).toBe(3);
  });

  it("does not count last week's or next week's applications", async () => {
    const world = await createWorld();
    await addApp(world, "stripe", { status: "prepared", decidedAt: new Date("2026-11-02T15:00:00Z") });
    await addApp(world, "datadog", { status: "submitted", submittedAt: new Date("2026-11-16T05:00:00Z") });
    expect(await weekCount(world.user.id, NOW, "America/New_York")).toBe(0);
  });

  it("excludes the given application and ignores other users", async () => {
    const world = await createWorld();
    const other = await createWorld();
    const mine = await addApp(world, "stripe", { status: "prepared", decidedAt: NOW });
    await addApp(other, "stripe", { status: "prepared", decidedAt: NOW });
    expect(await weekCount(world.user.id, NOW, "America/New_York")).toBe(1);
    expect(await weekCount(world.user.id, NOW, "America/New_York", mine.id)).toBe(0);
  });
});

describe("getActivity", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("is empty for a new user", async () => {
    const world = await createWorld();
    expect(await getActivity(world.user.id, "America/New_York", NOW)).toEqual({
      items: [],
      stats: { weekCount: 0, weeklyCap: null, waiting: 0, prepared: 0, submitted: 0, skipped: 0 },
      campaignActive: false,
    });
  });

  it("orders waiting, prepared, submitted, skipped, with stats and per-row audit trails", async () => {
    const world = await createWorld();
    await approveRules(world, { weeklyCap: 3 });
    const { prepareApplication, recordSubmission, skipWaiting } = await import("./index");
    const submitted = await prepareApplication(world.user.id, world.jobs.stripe.id, "user", NOW);
    await recordSubmission(world.user.id, submitted.id, "user");
    await prepareApplication(world.user.id, world.jobs.datadog.id, "user", NOW);
    const skipped = await prepareApplication(world.user.id, world.jobs.palantir.id, "user", NOW);
    await skipWaiting(world.user.id, skipped.id);
    await prepareApplication(world.user.id, world.jobs.meta.id, "user", NOW);

    const data = await getActivity(world.user.id, "America/New_York", new Date());
    expect(data.items.map((item) => [item.companyName, item.status])).toEqual([
      ["Meta", "waiting"],
      ["Datadog", "prepared"],
      ["Stripe", "submitted"],
      ["Palantir", "skipped"],
    ]);
    expect(data.stats).toMatchObject({ weeklyCap: 3, waiting: 1, prepared: 1, submitted: 1, skipped: 1 });
    expect(data.campaignActive).toBe(true);
    const stripe = data.items.find((item) => item.companyName === "Stripe");
    expect(stripe?.events.map((e) => e.action)).toEqual(["application.submitted", "application.prepared"]);
    expect(stripe?.resumeFilename).toBe("Resume_v3.pdf");
    expect(data.items[1].packet?.applyUrl).toBe(world.jobs.datadog.url);
  });
});
