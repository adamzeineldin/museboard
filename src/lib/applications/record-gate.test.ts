import { beforeEach, describe, expect, it, vi } from "vitest";
import { setCampaignStatus } from "@/lib/campaign";
import { db, resetDb } from "@/test/db";
import { approveRules, auditFor, createWorld, NOW, type World } from "./testing/fixtures";
import { resetDepMocks } from "./testing/mock-deps";

vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

const { ApplicationError, getSubmissionPacket, prepareApplication, recordSubmission } = await import("./index");

// recordSubmission's release gate (ground rule 2), shared by the web "Mark as submitted" and MCP
// record_submission: a submission is recordable when its packet was released for the current decision, or
// when the release check allows it right now. Nothing else can be recorded.

async function preparedStripe(world: World) {
  return prepareApplication(world.user.id, world.jobs.stripe.id, "muse", NOW);
}

const statusOf = async (id: string) => (await db.application.findUniqueOrThrow({ where: { id } })).status;

describe("recordSubmission release gate", () => {
  beforeEach(async () => {
    await resetDb();
    resetDepMocks();
  });

  it("refuses a held application that was never released, and audits the refusal", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await preparedStripe(world);
    await setCampaignStatus(world.user.id, "paused");

    const refused = recordSubmission(world.user.id, app.id, "muse", "Ref 1", NOW);
    await expect(refused).rejects.toBeInstanceOf(ApplicationError);
    await expect(recordSubmission(world.user.id, app.id, "user", undefined, NOW)).rejects.toMatchObject({
      code: "not_released",
      reason: "Campaign is paused",
      message: "Inroad won't record this submission: Campaign is paused. Its packet was never released, so nothing was recorded.",
    });
    expect(await statusOf(app.id)).toBe("prepared");
    const events = await auditFor(world.user.id, "application.record_refused");
    expect(events.map((event) => event.actor)).toEqual(["muse", "user"]);
    expect(events[0].payload).toMatchObject({ applicationId: app.id, status: "prepared", reason: "Campaign is paused" });
    expect(await auditFor(world.user.id, "application.submitted")).toHaveLength(0);
  });

  it("records a submission whose packet was released, even if the campaign was paused afterwards", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await preparedStripe(world);
    expect(await getSubmissionPacket(world.user.id, app.id, NOW, "muse")).toMatchObject({ allowed: true });
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).packetReleasedAt).toEqual(NOW);
    await setCampaignStatus(world.user.id, "paused");

    const submitted = await recordSubmission(world.user.id, app.id, "muse", undefined, NOW);
    expect(submitted.status).toBe("submitted");
    const [event] = await auditFor(world.user.id, "application.submitted");
    expect(event.payload).toMatchObject({ applicationId: app.id, allowedBy: "packet_released" });
  });

  it("records a submission whose packet was released, even if the campaign rules were edited afterwards", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await preparedStripe(world);
    await getSubmissionPacket(world.user.id, app.id, NOW, "muse");
    await approveRules(world, { autoCompanies: ["Datadog"] });
    expect((await getSubmissionPacket(world.user.id, app.id, NOW)).allowed).toBe(false);

    expect((await recordSubmission(world.user.id, app.id, "user", undefined, NOW)).status).toBe("submitted");
  });

  it("records a never-released application the release check allows right now", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await preparedStripe(world);
    expect((await db.application.findUniqueOrThrow({ where: { id: app.id } })).packetReleasedAt).toBeNull();

    expect((await recordSubmission(world.user.id, app.id, "user", undefined, NOW)).status).toBe("submitted");
    const [event] = await auditFor(world.user.id, "application.submitted");
    expect(event.payload).toMatchObject({ allowedBy: "release_check" });
  });

  it("stays idempotent for an already submitted application, whatever the campaign does next", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await preparedStripe(world);
    const submitted = await recordSubmission(world.user.id, app.id, "muse", "Ref 9", NOW);
    await setCampaignStatus(world.user.id, "paused");
    expect(await recordSubmission(world.user.id, app.id, "user", "again", NOW)).toEqual(submitted);
    expect(await auditFor(world.user.id, "application.submitted")).toHaveLength(1);
    expect(await auditFor(world.user.id, "application.record_refused")).toHaveLength(0);
  });

  it("a refused packet request does not count as a release", async () => {
    const world = await createWorld();
    await approveRules(world);
    const app = await preparedStripe(world);
    await setCampaignStatus(world.user.id, "paused");
    expect((await getSubmissionPacket(world.user.id, app.id, NOW, "muse")).allowed).toBe(false);
    await expect(recordSubmission(world.user.id, app.id, "muse", undefined, NOW)).rejects.toMatchObject({ code: "not_released" });
  });
});
