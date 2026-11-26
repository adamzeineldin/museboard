import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/generated/prisma/client";
import { approveVersion, getCampaignState, proposeVersion } from "@/lib/campaign";
import type { CampaignRules } from "@/lib/types";
import { createTestUser, db, resetDb } from "@/test/db";
import { createInroadMcpServer } from "../server";
import { call } from "../testing/calls";

// The campaign tools through an in-memory MCP client, with a fixed clock.

const PROPOSED_AT = new Date("2026-11-08T15:00:00Z");

let client: Client;
let clock: Date;

async function connect(userId: string): Promise<Client> {
  const server = createInroadMcpServer({ userId, scope: "write", now: () => clock });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  await server.connect(serverSide);
  const connected = new Client({ name: "test", version: "0.0.0" });
  await connected.connect(clientSide);
  return connected;
}

async function setup(): Promise<{ user: User; rules: CampaignRules; inForceId: string }> {
  const user = await createTestUser();
  const resume = await db.resume.create({ data: { userId: user.id, filename: "r.pdf", storageKey: "k", isDefault: true } });
  const rules: CampaignRules = {
    roles: ["intern"],
    autoCompanies: ["Stripe"],
    askFirstCompanies: [],
    resumeId: resume.id,
    weeklyCap: 5,
    minMatch: 75,
    endsOn: "2026-12-15",
  };
  const v1 = await proposeVersion(user.id, rules, "web", PROPOSED_AT);
  await approveVersion(user.id, v1.id, "web", PROPOSED_AT);
  client = await connect(user.id);
  return { user, rules, inForceId: v1.id };
}

describe("campaign MCP tools", () => {
  beforeEach(async () => {
    await resetDb();
    clock = PROPOSED_AT;
  });
  afterEach(async () => {
    await client?.close();
  });

  it("propose_campaign says when reverting to the rules in force withdrew the pending version", async () => {
    const { user, rules, inForceId } = await setup();
    const pending = await proposeVersion(user.id, { ...rules, weeklyCap: 8 }, "web", PROPOSED_AT);

    const result = await call(client, "propose_campaign", { rules });
    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({
      versionId: inForceId,
      outcome: "withdrawn_pending",
      approved: true,
      changed: true,
      inForceVersionId: inForceId,
      replacedVersionId: pending.id,
    });
    expect(result.data.message).toBe(
      `These rules are already the rules in force, so the pending version ${pending.id} was withdrawn and can no longer be approved. There is nothing to approve.`,
    );
    expect(result.text).toContain("Withdrew the pending campaign rules.");
    expect((await getCampaignState(user.id)).pending).toBeNull();
  });

  it("propose_campaign reports each outcome", async () => {
    const { rules } = await setup();
    expect((await call(client, "propose_campaign", { rules })).data).toMatchObject({ outcome: "unchanged_in_force", changed: false });
    const created = await call(client, "propose_campaign", { rules: { ...rules, weeklyCap: 3 } });
    expect(created.data).toMatchObject({ outcome: "created", changed: true, approved: false });
    const again = await call(client, "propose_campaign", { rules: { ...rules, weeklyCap: 3 } });
    expect(again.data).toMatchObject({ outcome: "unchanged_pending", changed: false });
  });

  it("get_campaign reports an active campaign past its end date as ended", async () => {
    await setup();
    expect((await call(client, "get_campaign")).data.status).toBe("active");

    // Dec 15 is still the last day in New York at 03:00 UTC on Dec 16.
    clock = new Date("2026-12-16T03:00:00Z");
    expect((await call(client, "get_campaign")).data.status).toBe("active");

    clock = new Date("2026-12-16T12:00:00Z");
    const ended = await call(client, "get_campaign");
    expect(ended.isError).toBe(false);
    expect(ended.data.status).toBe("ended");
    expect(ended.text).toContain("Campaign ended on 2026-12-15.");
    expect(ended.text).not.toContain("Campaign is active.");
  });

  it("get_campaign hands Muse the user's free-form instructions, or null when there are none", async () => {
    const { user } = await setup();
    const empty = await call(client, "get_campaign");
    expect(empty.data.instructions).toBeNull();
    expect(empty.text).not.toContain("left instructions");

    await db.user.update({ where: { id: user.id }, data: { museInstructions: "Prioritize fintech.\nSkip crypto." } });
    const withText = await call(client, "get_campaign");
    expect(withText.isError).toBe(false);
    expect(withText.data.instructions).toBe("Prioritize fintech.\nSkip crypto.");
    expect(withText.text).toContain("The user left instructions for Muse");
  });
});
