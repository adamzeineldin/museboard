import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { toolContext } from "./context";
import { auditSdkRefusals } from "./refusal-audit";

const { auditCall } = vi.hoisted(() => ({ auditCall: vi.fn(async () => undefined) }));
vi.mock("./tool-kit", async (importOriginal) => ({ ...(await importOriginal<typeof import("./tool-kit")>()), auditCall }));

const ctx = toolContext({ userId: "u1", scope: "write" });
const KNOWN = new Set(["known_tool"]);

async function connect(server: McpServer): Promise<Client> {
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "1.0.0" });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return client;
}

function serverWithKnownTool(): { server: McpServer; audit: ReturnType<typeof auditSdkRefusals> } {
  const server = new McpServer({ name: "t", version: "1.0.0" });
  const audit = auditSdkRefusals(server, ctx, KNOWN);
  server.registerTool("known_tool", { inputSchema: { n: z.number() } }, async () => ({ content: [{ type: "text", text: "ok" }] }));
  return { server, audit };
}

beforeEach(() => {
  auditCall.mockClear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("auditSdkRefusals", () => {
  it.each([
    ["a name with a space", "my tool", "Tool my tool not found"],
    ["a name with a newline", "line one\nline two", "Tool line one line two not found"],
  ])("audits a refused call to %s under unknown_tool", async (_label, name, summary) => {
    const { server } = serverWithKnownTool();
    const client = await connect(server);
    const result = await client.callTool({ name, arguments: {} });
    await client.close();

    expect(result.isError).toBe(true);
    expect(auditCall).toHaveBeenCalledTimes(1);
    expect(auditCall).toHaveBeenCalledWith(ctx, "unknown_tool", expect.objectContaining({ args: { tool: name }, ok: false, summary }));
  });

  it("builds the unknown tool summary from the clipped name, not the SDK text", async () => {
    const { server } = serverWithKnownTool();
    const client = await connect(server);
    const name = `x\u0007${"y".repeat(300)}`;
    await client.callTool({ name, arguments: {} });
    await client.close();

    const clipped = name.slice(0, 64).replace("\u0007", " ");
    expect(auditCall).toHaveBeenCalledWith(ctx, "unknown_tool", expect.objectContaining({ summary: `Tool ${clipped} not found` }));
  });

  it("audits input validation errors on a known tool without the arguments", async () => {
    const { server } = serverWithKnownTool();
    const client = await connect(server);
    await client.callTool({ name: "known_tool", arguments: { n: "secret" } });
    await client.close();

    expect(auditCall).toHaveBeenCalledWith(ctx, "known_tool", expect.objectContaining({ args: {}, ok: false }));
  });

  it("wraps a tools/call handler registered with a different schema object for the same method", async () => {
    const server = new McpServer({ name: "t", version: "1.0.0" });
    const audit = auditSdkRefusals(server, ctx, KNOWN);
    const lookalike = z.object({ method: z.literal("tools/call"), params: z.object({ name: z.string() }).passthrough() });
    server.server.registerCapabilities({ tools: {} });
    server.server.setRequestHandler(lookalike, async () => ({
      isError: true,
      content: [{ type: "text" as const, text: "MCP error -32602: Tool ghost not found" }],
    }));
    const client = await connect(server);
    await client.callTool({ name: "ghost", arguments: {} });
    await client.close();

    expect(audit.assertInstalled()).toBe(true);
    expect(auditCall).toHaveBeenCalledWith(ctx, "unknown_tool", expect.objectContaining({ args: { tool: "ghost" }, summary: "Tool ghost not found" }));
  });

  it("does not audit tool errors that are not SDK refusals", async () => {
    const server = new McpServer({ name: "t", version: "1.0.0" });
    auditSdkRefusals(server, ctx, KNOWN);
    server.registerTool("known_tool", {}, async () => ({ isError: true, content: [{ type: "text", text: "Tool known_tool not found" }] }));
    const client = await connect(server);
    await client.callTool({ name: "known_tool", arguments: {} });
    await client.close();

    expect(auditCall).not.toHaveBeenCalled();
  });

  it("reports whether the tools/call handler was wrapped, and logs loudly when it was not", () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const bare = new McpServer({ name: "t", version: "1.0.0" });
    const unwired = auditSdkRefusals(bare, ctx, KNOWN);
    expect(unwired.assertInstalled()).toBe(false);
    expect(errors).toHaveBeenCalledWith(expect.stringContaining("refusal audit"), expect.anything());

    errors.mockClear();
    const { audit } = serverWithKnownTool();
    expect(audit.assertInstalled()).toBe(true);
    expect(errors).not.toHaveBeenCalled();
  });
});
