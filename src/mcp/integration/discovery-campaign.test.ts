import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/mcp/route";
import { getCampaignState } from "@/lib/campaign";
import { RULE_REASONS } from "@/lib/rules";
import { db, resetDb } from "@/test/db";
import { campaignRules, JOB_IDS, useTempStorage } from "@/test/integration/world";
import { call } from "../testing/calls";
import { connectClient, startRouteServer, type TestHttpServer } from "../testing/http-harness";
import { studentWithCampaign, tokenFor, type McpWorld } from "../testing/world";

// Read tools and the campaign tools, called through an MCP client against the real /mcp route.

let server: TestHttpServer;
let restoreStorage: () => void;
let world: McpWorld;
let client: Client;

beforeAll(async () => {
  restoreStorage = useTempStorage();
  server = await startRouteServer("/mcp", { GET, POST, DELETE });
});
afterAll(async () => {
  await server.close();
  restoreStorage();
});
beforeEach(async () => {
  await resetDb();
  world = await studentWithCampaign();
  client = await connectClient(server.url, await tokenFor(world.user.id));
});
afterEach(async () => {
  await client.close();
});

interface Role {
  jobId: string;
  matchScore: number | null;
  status: string;
  reason: string;
  warmPath: boolean;
  warmPathContacts: number;
}

const rolesOf = (data: Record<string, unknown>): Role[] => data.roles as Role[];

describe("find_roles", () => {
  it("returns scores, rule status and warm-path flags, best match first", async () => {
    const result = await call(client, "find_roles");
    expect(result.isError).toBe(false);
    const roles = rolesOf(result.data);
    expect(roles).toHaveLength(6);
    const scores = roles.map((r) => r.matchScore ?? -1);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));

    const byId = new Map(roles.map((r) => [r.jobId, r]));
    expect(byId.get(JOB_IDS.stripe)).toMatchObject({ status: "will_auto_apply", reason: RULE_REASONS.fits, warmPath: false });
    expect(byId.get(JOB_IDS.meta)).toMatchObject({ status: "referral_first", reason: RULE_REASONS.topChoice, warmPath: true, warmPathContacts: 2 });
    expect(byId.get(JOB_IDS.rampNewGrad)).toMatchObject({ status: "held", reason: RULE_REASONS.roleNotInCampaign });
    expect(byId.get(JOB_IDS.sales)).toMatchObject({ status: "held", reason: RULE_REASONS.notOnCompanyList });
    expect(byId.get(JOB_IDS.stripe)?.matchScore).toBeGreaterThanOrEqual(70);

    const audit = await db.auditEvent.findFirst({ where: { userId: world.user.id, action: "muse.find_roles" } });
    expect(audit).toMatchObject({ actor: "muse", payload: { args: { type: null, company: null, newOnly: false }, ok: true } });
  });

  it("filters by type, company and newOnly, and shows an existing application's status", async () => {
    expect(rolesOf((await call(client, "find_roles", { type: "newgrad" })).data).map((r) => r.jobId)).toEqual([JOB_IDS.rampNewGrad]);
    expect(rolesOf((await call(client, "find_roles", { company: "stripe" })).data).map((r) => r.jobId)).toEqual([JOB_IDS.stripe]);
    expect(rolesOf((await call(client, "find_roles", { company: "Nowhere Inc" })).data)).toEqual([]);

    await db.job.update({ where: { id: JOB_IDS.sales }, data: { firstSeenAt: new Date(Date.now() - 30 * 86_400_000) } });
    const fresh = rolesOf((await call(client, "find_roles", { newOnly: true })).data).map((r) => r.jobId);
    expect(fresh).toHaveLength(5);
    expect(fresh).not.toContain(JOB_IDS.sales);

    await call(client, "prepare_application", { jobId: JOB_IDS.stripe });
    const [stripe] = rolesOf((await call(client, "find_roles", { company: "Stripe" })).data);
    expect(stripe).toMatchObject({ status: "prepared", reason: RULE_REASONS.fits });
  });
});

describe("find_warm_path", () => {
  it("lists the user's contacts at a company, warmest first, and nothing for a company without contacts", async () => {
    const meta = await call(client, "find_warm_path", { company: "meta" });
    expect(meta.data.company).toBe("Meta");
    const contacts = meta.data.contacts as { contactId: string; name: string }[];
    expect(contacts.map((c) => c.name)).toEqual(["Alex Kim", "Priya Shah"]);
    expect(contacts[0].contactId).toBe(world.bestContactId);
    expect(contacts[0]).not.toHaveProperty("email");

    const stripe = await call(client, "find_warm_path", { company: "Stripe" });
    expect(stripe).toMatchObject({ isError: false, data: { company: "Stripe", contacts: [] } });
  });
});

describe("campaign tools", () => {
  it("propose_campaign creates an unapproved version; get_campaign shows it pending while the old version stays in force", async () => {
    const before = await call(client, "get_campaign");
    expect(before.data).toMatchObject({
      status: "active",
      pending: null,
      inForce: { versionId: world.versionId },
      defaultResume: { resumeId: world.resumeId, filename: "jordan-lee.txt" },
    });
    expect((before.data.inForce as { summary: string[] }).summary[0]).toMatch(/^Apply to internships at Stripe/);

    const rules = { ...campaignRules(world.resumeId, new Date()), weeklyCap: 5, askFirstCompanies: [], autoCompanies: ["Stripe", "Meta"] };
    const proposed = await call(client, "propose_campaign", { rules });
    expect(proposed.isError).toBe(false);
    expect(proposed.data).toMatchObject({ approved: false, inForceVersionId: world.versionId });
    expect(proposed.data.summary).toEqual(expect.arrayContaining([expect.stringMatching(/^At most 5 applications a week, until /)]));
    expect(proposed.text).toMatch(/Nothing changes until the user approves/);

    const versionId = proposed.data.versionId as string;
    const row = await db.campaignVersion.findUniqueOrThrow({ where: { id: versionId } });
    expect(row.approvedAt).toBeNull();
    const state = await getCampaignState(world.user.id);
    expect(state.inForce?.id).toBe(world.versionId);
    expect(state.pending?.id).toBe(versionId);

    const during = await call(client, "get_campaign");
    expect(during.data).toMatchObject({ inForce: { versionId: world.versionId, rules: { weeklyCap: 2 } }, pending: { versionId, approvedAt: null } });
    // The old version still governs: Meta is still ask-first.
    const [meta] = rolesOf((await call(client, "find_roles", { company: "Meta" })).data);
    expect(meta.status).toBe("referral_first");

    const approved = await call(client, "approve_campaign", { versionId });
    expect(approved.isError).toBe(false);
    expect(approved.data).toMatchObject({ versionId, approvedVia: "muse", campaignStatus: "active" });
    expect(await db.campaignVersion.findUniqueOrThrow({ where: { id: versionId } })).toMatchObject({ approvedVia: "muse", approvedBy: world.user.id });
    const after = await call(client, "get_campaign");
    expect(after.data).toMatchObject({ inForce: { versionId, approvedVia: "muse" }, pending: null });

    const actions = (await db.auditEvent.findMany({ where: { userId: world.user.id, actor: "muse" } })).map((e) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["muse.propose_campaign", "campaign.proposed", "muse.approve_campaign", "campaign.approved"]));
  });

  it("returns user-safe errors for invalid rules, unknown versions and double approval", async () => {
    const bad = await call(client, "propose_campaign", { rules: { ...campaignRules(world.resumeId, new Date()), weeklyCap: 99 } });
    expect(bad.isError).toBe(true);
    const unknown = await call(client, "approve_campaign", { versionId: "nope" });
    expect(unknown).toMatchObject({ isError: true, text: "We couldn't find that campaign version." });
    const twice = await call(client, "approve_campaign", { versionId: world.versionId });
    expect(twice).toMatchObject({ isError: true, text: "That version is already approved." });
    const audits = await db.auditEvent.findMany({ where: { action: "muse.approve_campaign" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    expect(audits.map((a) => a.payload)).toEqual([
      { args: { versionId: "nope" }, ok: false, summary: "We couldn't find that campaign version." },
      { args: { versionId: world.versionId }, ok: false, summary: "That version is already approved." },
    ]);
  });
});
