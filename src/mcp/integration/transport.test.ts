import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE, GET, POST } from "@/app/mcp/route";
import { GET as metadataGET } from "@/app/.well-known/oauth-protected-resource/route";
import { createConnectorToken, revokeToken } from "@/lib/connector";
import { db, resetDb } from "@/test/db";
import { useTempStorage } from "@/test/integration/world";
import { connectClient, JSON_RPC_HEADERS, startRouteServer, type TestHttpServer } from "../testing/http-harness";
import { studentWithCampaign, tokenFor } from "../testing/world";

// The /mcp route over real HTTP: auth, scopes, Origin, rate limit, methods and body size.

const APP_URL = "https://inroad.test";
const RESOURCE_METADATA = `${APP_URL}/.well-known/oauth-protected-resource`;
const ALL_TOOLS = [
  "approve_campaign",
  "draft_outreach",
  "find_roles",
  "find_warm_path",
  "get_campaign",
  "prepare_application",
  "propose_campaign",
  "record_submission",
  "run_weekly_pass",
  "submit_application",
];
const READ_TOOLS = ["find_roles", "find_warm_path", "get_campaign"];

let server: TestHttpServer;
let restoreStorage: () => void;
const previousAppUrl = process.env.APP_URL;

beforeAll(async () => {
  process.env.APP_URL = APP_URL;
  restoreStorage = useTempStorage();
  server = await startRouteServer("/mcp", { GET, POST, DELETE });
});
afterAll(async () => {
  await server.close();
  restoreStorage();
  if (previousAppUrl === undefined) delete process.env.APP_URL;
  else process.env.APP_URL = previousAppUrl;
});

const ping = (headers: Record<string, string> = {}, body = '{"jsonrpc":"2.0","method":"ping","id":1}') =>
  fetch(server.url, { method: "POST", headers: { ...JSON_RPC_HEADERS, ...headers }, body });

describe("/mcp authentication", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("answers 401 with WWW-Authenticate pointing at the protected-resource metadata when the token is missing", async () => {
    const response = await ping();
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe(`Bearer resource_metadata="${RESOURCE_METADATA}"`);
  });

  it("answers 401 invalid_token for a malformed, unknown or revoked token", async () => {
    const { user } = await studentWithCampaign();
    const { token, record } = await createConnectorToken(user.id, "Muse", "write");
    await revokeToken(user.id, record.id);
    for (const header of ["Bearer nope", `Bearer inr_${"B".repeat(43)}`, `Bearer ${token}`]) {
      const response = await ping({ Authorization: header });
      expect(response.status).toBe(401);
      const challenge = response.headers.get("www-authenticate") ?? "";
      expect(challenge).toContain(`resource_metadata="${RESOURCE_METADATA}"`);
      expect(challenge).toContain('error="invalid_token"');
      expect(await response.text()).not.toContain(token);
    }
    await expect(connectClient(server.url, token)).rejects.toThrow();
  });

  it("serves RFC 9728 metadata for the resource", async () => {
    const body = await (await metadataGET()).json();
    expect(body).toEqual({
      resource: `${APP_URL}/mcp`,
      resource_name: "Inroad",
      scopes_supported: ["inroad.read", "inroad.write"],
      bearer_methods_supported: ["header"],
      authorization_servers: [],
    });
  });
});

describe("/mcp tool listing by scope", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("lists all 10 tools with Muse-class annotations for a write token", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id, "write"));
    const { tools } = await client.listTools();
    await client.close();

    expect(tools.map((t) => t.name).sort()).toEqual(ALL_TOOLS);
    const byName = new Map(tools.map((t) => [t.name, t]));
    for (const tool of tools) {
      expect(tool.title).toBeTruthy();
      expect(tool.outputSchema).toBeDefined();
      expect(tool.annotations?.openWorldHint).toBe(false);
      expect(tool.inputSchema).toMatchObject({ type: "object", additionalProperties: false });
      const readOnly = READ_TOOLS.includes(tool.name);
      expect(tool.annotations?.readOnlyHint).toBe(readOnly);
      expect(tool.description).toMatch(readOnly ? /^Muse class: Read\./ : /^Muse class: (Write|Sensitive write)\./);
    }
    for (const name of ["approve_campaign", "submit_application"]) {
      expect(byName.get(name)?.description).toMatch(/^Muse class: Sensitive write\./);
      expect(byName.get(name)?.annotations?.destructiveHint).toBe(true);
    }
    expect(byName.get("approve_campaign")?.description).toMatch(/show the user the summary returned by propose_campaign.*explicit yes/);
    expect(byName.get("draft_outreach")?.description).toMatch(/Inroad never sends messages/);
    expect(byName.get("find_roles")?.annotations).toMatchObject({ idempotentHint: true, destructiveHint: false });
    for (const tool of tools) expect(tool.description).not.toMatch(/(skip|bypass|ignore)\w* (the |its |any |Muse's )?(permission|approval|prompt|confirmation)/i);
  });

  it("lists only the 3 Read tools for a read token and refuses write tools", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id, "read"));
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(READ_TOOLS);

    const result = await client.callTool({ name: "run_weekly_pass", arguments: {} });
    await client.close();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toMatch(/run_weekly_pass not found/);
    expect(await db.application.count()).toBe(0);
  });

  it("rejects a userId argument (strict input schemas)", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id));
    const result = await client.callTool({ name: "find_roles", arguments: { userId: "someone-else" } });
    const campaign = await client.callTool({ name: "get_campaign", arguments: { userId: user.id } });
    await client.close();
    for (const r of [result, campaign]) {
      expect(r.isError).toBe(true);
      expect(JSON.stringify(r.content)).toMatch(/Input validation error.*userId/s);
    }
  });
});

describe("/mcp transport guards", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("rate limits each token to 60 requests a minute with 429 and Retry-After", async () => {
    const { user } = await studentWithCampaign();
    const token = await tokenFor(user.id);
    const statuses: number[] = [];
    for (let i = 0; i < 60; i += 1) statuses.push((await ping({ Authorization: `Bearer ${token}` })).status);
    expect(statuses.every((s) => s !== 429)).toBe(true);

    const limited = await ping({ Authorization: `Bearer ${token}` });
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
    // Another token of the same user has its own bucket.
    expect((await ping({ Authorization: `Bearer ${await tokenFor(user.id)}` })).status).not.toBe(429);
  });

  it("rejects a foreign Origin (DNS-rebinding protection) and accepts the app's own", async () => {
    const { user } = await studentWithCampaign();
    const auth = { Authorization: `Bearer ${await tokenFor(user.id)}` };
    expect((await ping({ ...auth, Origin: "https://evil.example" })).status).toBe(403);
    expect((await ping({ ...auth, Origin: "null" })).status).toBe(403);
    expect((await ping({ ...auth, Origin: APP_URL })).status).toBe(200);
  });

  it("answers 405 to GET and DELETE (stateless) and 413 to bodies over 1 MB", async () => {
    const { user } = await studentWithCampaign();
    const auth = { Authorization: `Bearer ${await tokenFor(user.id)}` };
    for (const method of ["GET", "DELETE"]) {
      const response = await fetch(server.url, { method, headers: { ...auth, Accept: "text/event-stream" } });
      expect(response.status).toBe(405);
      expect(response.headers.get("allow")).toBe("POST");
    }
    expect((await fetch(server.url, { method: "GET" })).status).toBe(401);

    const big = JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1, params: { pad: "x".repeat(1024 * 1024) } });
    expect((await ping(auth, big)).status).toBe(413);
  });

  it("never returns internal error details", async () => {
    const { user } = await studentWithCampaign();
    const client = await connectClient(server.url, await tokenFor(user.id));
    const spy = vi.spyOn(db.job, "findMany").mockRejectedValueOnce(new Error("SQLITE_BUSY: database is locked at /secret/path"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const result = await client.callTool({ name: "find_roles", arguments: {} });
    await client.close();
    spy.mockRestore();
    errors.mockRestore();
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toBe(JSON.stringify([{ type: "text", text: "Something went wrong in Inroad. Try again in a moment." }]));
  });
});
