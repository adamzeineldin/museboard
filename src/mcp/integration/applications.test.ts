import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/mcp/route";
import { approveWaiting } from "@/lib/applications";
import { setCampaignStatus } from "@/lib/campaign";
import { RULE_REASONS } from "@/lib/rules";
import { db, resetDb } from "@/test/db";
import { JOB_IDS, useTempStorage } from "@/test/integration/world";
import { call } from "../testing/calls";
import { connectClient, startRouteServer, type TestHttpServer } from "../testing/http-harness";
import { studentWithCampaign, tokenFor, type McpWorld } from "../testing/world";

// Application, outreach and weekly-pass tools through an MCP client against the real /mcp route.
// The world's approved campaign: auto Stripe/Datadog/Cloudflare/Ramp (interns), Meta ask-first, cap 2.

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

async function prepare(jobId: string): Promise<string> {
  const result = await call(client, "prepare_application", { jobId });
  expect(result.isError).toBe(false);
  return result.data.applicationId as string;
}

describe("prepare_application", () => {
  it("prepares a passing job with its packet and audits the rule check", async () => {
    const result = await call(client, "prepare_application", { jobId: JOB_IDS.stripe });
    expect(result.data).toMatchObject({ jobId: JOB_IDS.stripe, status: "prepared", decidedBy: "campaign", ok: true, reason: RULE_REASONS.fits, topChoice: false });
    expect(result.data.packet).toMatchObject({ applyUrl: expect.stringContaining("jobs.example.com"), answers: { fullName: "Jordan Lee" } });

    const audit = await db.auditEvent.findFirst({ where: { userId: world.user.id, action: "application.prepared" } });
    expect(audit).toMatchObject({ actor: "muse", payload: { applicationId: result.data.applicationId, ok: true, reason: RULE_REASONS.fits } });
    expect(await db.auditEvent.count({ where: { action: "muse.prepare_application", actor: "muse" } })).toBe(1);
  });

  it("holds a top-choice job as waiting, with no packet, and drafts a referral ask", async () => {
    const result = await call(client, "prepare_application", { jobId: JOB_IDS.meta });
    expect(result.data).toMatchObject({ status: "waiting", ok: false, reason: RULE_REASONS.topChoice, topChoice: true, packet: null });
    expect(await db.outreach.findMany({ where: { userId: world.user.id } })).toEqual([
      expect.objectContaining({ kind: "referral_ask", contactId: world.bestContactId, status: "draft" }),
    ]);
  });
});

describe("submit_application", () => {
  it("releases the packet and apply URL for an application that passes the rule check now", async () => {
    const id = await prepare(JOB_IDS.stripe);
    const result = await call(client, "submit_application", { applicationId: id });
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ applicationId: id, applyUrl: `https://jobs.example.com/${encodeURIComponent(JOB_IDS.stripe)}` });
    expect(result.data.packet).toMatchObject({ tailoredSummary: expect.any(String), notes: expect.any(Array) });
    // No state change besides the audit entries.
    expect(await db.application.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "prepared", submittedAt: null });
    expect(await db.auditEvent.findFirst({ where: { action: "application.packet_requested" } })).toMatchObject({
      actor: "muse",
      payload: { applicationId: id, allowed: true },
    });
  });

  it("refuses a waiting application and a job outside the campaign", async () => {
    const meta = await prepare(JOB_IDS.meta);
    const sales = await prepare(JOB_IDS.sales);
    expect(await call(client, "submit_application", { applicationId: meta })).toMatchObject({
      isError: true,
      text: `Inroad won't release this application: Waiting on your approval: ${RULE_REASONS.topChoice}`,
      data: {},
    });
    const outside = await call(client, "submit_application", { applicationId: sales });
    expect(outside).toMatchObject({ isError: true, text: expect.stringContaining(RULE_REASONS.notOnCompanyList) });
    expect(outside.text).not.toContain("jobs.example.com");
  });

  it("refuses a prepared application once the campaign is paused", async () => {
    const id = await prepare(JOB_IDS.stripe);
    await setCampaignStatus(world.user.id, "paused");
    const result = await call(client, "submit_application", { applicationId: id });
    expect(result).toMatchObject({ isError: true, text: `Inroad won't release this application: ${RULE_REASONS.paused}` });
  });

  it("does not hand out the packet through a repeat prepare_application once the rule check rejects it", async () => {
    const id = await prepare(JOB_IDS.stripe);
    await setCampaignStatus(world.user.id, "paused");
    const again = await call(client, "prepare_application", { jobId: JOB_IDS.stripe });
    expect(again).toMatchObject({
      isError: false,
      data: { applicationId: id, status: "prepared", ok: false, reason: `Held: ${RULE_REASONS.paused}`, packet: null },
    });
    expect(JSON.stringify(again)).not.toContain("jobs.example.com");

    await setCampaignStatus(world.user.id, "active");
    const resumed = await call(client, "prepare_application", { jobId: JOB_IDS.stripe });
    expect(resumed.data).toMatchObject({ applicationId: id, ok: true, reason: RULE_REASONS.fits });
    expect(resumed.data.packet).toMatchObject({ applyUrl: expect.stringContaining("jobs.example.com") });
  });

  it("refuses a campaign-prepared application over the weekly cap but allows the one the user approved", async () => {
    const stripe = await prepare(JOB_IDS.stripe);
    const datadog = await prepare(JOB_IDS.datadog);
    const cloudflare = await prepare(JOB_IDS.cloudflare);
    expect(await db.application.findUniqueOrThrow({ where: { id: cloudflare } })).toMatchObject({ status: "waiting", reason: RULE_REASONS.weeklyLimit });
    await approveWaiting(world.user.id, cloudflare); // the user says yes: now 3 committed this week (cap 2)

    // The user's approval takes a slot, so the newest campaign-prepared row goes over the cap; the older one still fits.
    const over = await call(client, "submit_application", { applicationId: datadog });
    expect(over).toMatchObject({ isError: true, text: `Inroad won't release this application: ${RULE_REASONS.weeklyLimit}` });
    expect((await call(client, "submit_application", { applicationId: stripe })).isError).toBe(false);
    const approved = await call(client, "submit_application", { applicationId: cloudflare });
    expect(approved.isError).toBe(false);
    expect(approved.data.applyUrl).toContain(encodeURIComponent(JOB_IDS.cloudflare));
  });
});

describe("record_submission", () => {
  it("marks a prepared application submitted, with audit entries, and refuses a waiting one", async () => {
    const id = await prepare(JOB_IDS.stripe);
    const result = await call(client, "record_submission", { applicationId: id, confirmationText: "Thanks for applying! Ref 123" });
    expect(result.data).toMatchObject({ applicationId: id, status: "submitted", submittedAt: expect.any(String) });
    expect(await db.application.findUniqueOrThrow({ where: { id } })).toMatchObject({ status: "submitted", confirmationText: "Thanks for applying! Ref 123" });
    expect(await db.auditEvent.findFirst({ where: { action: "application.submitted" } })).toMatchObject({ actor: "muse" });
    const museAudit = await db.auditEvent.findFirst({ where: { action: "muse.record_submission" } });
    expect(museAudit?.payload).toMatchObject({ args: { applicationId: id, hasConfirmation: true }, ok: true });
    expect(JSON.stringify(museAudit?.payload)).not.toContain("Ref 123");

    const waiting = await prepare(JOB_IDS.meta);
    expect(await call(client, "record_submission", { applicationId: waiting })).toMatchObject({
      isError: true,
      text: "Only applications that are ready to submit can be marked submitted.",
    });
  });
});

describe("run_weekly_pass and draft_outreach", () => {
  it("runs the weekly pass and drafts referral asks for top choices", async () => {
    const result = await call(client, "run_weekly_pass");
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ reason: null, failed: [], referralDrafts: ["Meta · Software Engineer Intern, 2027"] });
    expect(result.data.submitted).toHaveLength(2);
    expect(result.data.waiting).toHaveLength(2);
    expect(result.text).toMatch(/^Weekly pass: 2 applications cleared to submit, 2 waiting on the user, 1 referral ask drafted\.$/);
    expect(await db.outreach.count({ where: { userId: world.user.id, kind: "referral_ask", jobId: JOB_IDS.meta } })).toBe(1);
    expect(await db.auditEvent.findFirst({ where: { action: "weekly_pass.ran" } })).toMatchObject({ actor: "muse" });
  });

  it("drafts outreach, returns the packet and never sends it", async () => {
    const result = await call(client, "draft_outreach", { contactId: world.bestContactId, jobId: JOB_IDS.meta, kind: "referral_ask" });
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({ kind: "referral_ask", status: "draft", draft: expect.stringContaining("Alex") });
    expect(result.data.packet).toMatchObject({ role: { jobId: JOB_IDS.meta, company: "Meta" }, fitSummary: expect.any(Array) });
    expect(result.text).toMatch(/Inroad never sends messages/);
    expect(await db.outreach.findUniqueOrThrow({ where: { id: result.data.outreachId as string } })).toMatchObject({ status: "draft", sentAt: null });
  });
});

describe("cross-user isolation", () => {
  it("token A cannot read or change user B's applications or contacts", async () => {
    const other = await studentWithCampaign(false);
    const otherClient = await connectClient(server.url, await tokenFor(other.user.id));
    const otherApp = (await call(otherClient, "prepare_application", { jobId: JOB_IDS.stripe })).data.applicationId as string;
    await otherClient.close();

    for (const [name, args] of [
      ["submit_application", { applicationId: otherApp }],
      ["record_submission", { applicationId: otherApp }],
      ["draft_outreach", { contactId: other.bestContactId, kind: "coffee_chat" }],
      ["approve_campaign", { versionId: other.versionId }],
    ] as const) {
      const result = await call(client, name, args);
      expect(result.isError).toBe(true);
      expect(result.text).toMatch(/couldn't find|not found/i);
      expect(result.text).not.toContain(other.user.email);
    }
    expect(await db.application.findUniqueOrThrow({ where: { id: otherApp } })).toMatchObject({ status: "prepared", submittedAt: null });
    expect(await db.outreach.count({ where: { userId: world.user.id } })).toBe(0);

    const mine = (await call(client, "find_roles", { company: "Stripe" })).data.roles as { status: string; applicationId: string | null }[];
    expect(mine[0]).toMatchObject({ status: "will_auto_apply", applicationId: null });
    const theirAudits = await db.auditEvent.count({ where: { userId: other.user.id, action: { startsWith: "muse." } } });
    expect(theirAudits).toBe(1); // only their own prepare_application
  });
});
