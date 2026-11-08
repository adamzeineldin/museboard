import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DELETE, GET, POST } from "@/app/mcp/route";
import { db, resetDb } from "@/test/db";
import { useTempStorage } from "@/test/integration/world";
import { call } from "../testing/calls";
import { connectClient, startRouteServer, type TestHttpServer } from "../testing/http-harness";
import { studentWithCampaign, tokenFor } from "../testing/world";

// Calls the MCP SDK refuses before a tool runs (tool not available to the token, bad arguments) are still
// audited as muse.<tool> with ok: false, so the Activity page and the Muse panel show the attempt.

let server: TestHttpServer;
let restoreStorage: () => void;

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
});

const museAudits = (userId: string) =>
  db.auditEvent.findMany({ where: { userId, actor: "muse", action: { startsWith: "muse." } }, orderBy: { createdAt: "asc" } });

describe("audit of SDK-refused tool calls", () => {
  it("audits a write tool called with a read token", async () => {
    const { user, versionId } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id, "read"));
    const result = await call(client, "approve_campaign", { versionId });
    await client.close();

    expect(result).toMatchObject({ isError: true, text: "MCP error -32602: Tool approve_campaign not found" });
    const audits = await museAudits(user.id);
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ action: "muse.approve_campaign", payload: { args: {}, ok: false, summary: "MCP error -32602: Tool approve_campaign not found" } });
    expect(JSON.stringify(audits[0].payload)).not.toContain(versionId);
  });

  it("audits arguments that fail validation, without recording them", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id));
    const result = await call(client, "find_roles", { userId: "someone-else" });
    await client.close();

    expect(result.isError).toBe(true);
    const [audit] = await museAudits(user.id);
    expect(audit).toMatchObject({ action: "muse.find_roles", payload: { args: {}, ok: false, summary: expect.stringMatching(/^MCP error -32602: Input validation error/) } });
    expect(JSON.stringify(audit.payload)).not.toContain("someone-else");
  });

  it("files a call to a name Inroad does not have under muse.unknown_tool", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id));
    await call(client, `delete_${"x".repeat(300)}`, {});
    await client.close();

    const [audit] = await museAudits(user.id);
    expect(audit.action).toBe("muse.unknown_tool");
    expect((audit.payload as { args: { tool: string } }).args.tool.length).toBeLessThanOrEqual(64);
    expect(audit.payload).toMatchObject({ summary: `Tool delete_${"x".repeat(57)} not found` });
  });

  it("writes exactly one entry for a call that reaches the tool", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id));
    expect((await call(client, "get_campaign")).isError).toBe(false);
    expect((await call(client, "approve_campaign", { versionId: "missing-version" })).isError).toBe(true);
    await client.close();

    expect((await museAudits(user.id)).map((a) => a.action)).toEqual(["muse.get_campaign", "muse.approve_campaign"]);
  });
});
