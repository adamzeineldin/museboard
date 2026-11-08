import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/test/db";
import { approveRules, auditFor, createWorld, NOW } from "./testing/fixtures";

// Top choice end to end with the real outreach module (milestone 6): only fitSummary and the resume
// helpers are stubbed; bestContactAt and createReferralAskDraft are the real implementations.
vi.mock("@/lib/applications/deps", async () => {
  const { mockDeps } = await import("./testing/mock-deps");
  const outreach = await import("@/lib/outreach");
  return { ...mockDeps, bestContactAt: outreach.bestContactAt, createReferralAskDraft: outreach.createReferralAskDraft };
});

const { prepareApplication, runWeeklyPass } = await import("./index");

describe("top choice with the real outreach module", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("drafts one referral ask for the best contact and never sends it", async () => {
    const world = await createWorld();
    await approveRules(world);
    const contact = await db.contact.create({
      data: { userId: world.user.id, name: "Marcus T.", role: "Production Engineer", companyId: world.companies.Meta.id, relationship: "Alum, class of 2021", source: "manual" },
    });

    const app = await prepareApplication(world.user.id, world.jobs.meta.id, "muse", NOW);
    expect(app).toMatchObject({ status: "waiting", reason: "Top choice: referral first" });
    const drafts = await db.outreach.findMany({ where: { userId: world.user.id } });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]).toMatchObject({ contactId: contact.id, jobId: world.jobs.meta.id, kind: "referral_ask", status: "draft" });
    expect(drafts[0].draft.length).toBeGreaterThan(0);
    expect(await auditFor(world.user.id, "application.referral_drafted")).toHaveLength(1);

    // A weekly pass afterwards does not draft a second ask for the same contact and job.
    await runWeeklyPass(world.user.id, "muse", NOW);
    expect(await db.outreach.count({ where: { userId: world.user.id, jobId: world.jobs.meta.id } })).toBe(1);
  });
});
