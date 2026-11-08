import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ApplicationError } from "@/lib/applications";
import { CampaignError } from "@/lib/campaign";
import { OutreachError } from "@/lib/outreach";
import { db } from "@/test/db";
import { toolContext } from "./context";
import { GENERIC_TOOL_ERROR, ToolRefusal, toolErrorMessage } from "./errors";
import { INROAD_TOOLS, toolsForScope } from "./server";
import { annotationsFor, defineTool } from "./tool-kit";

describe("annotationsFor", () => {
  it("makes Read tools read-only and idempotent, and never open-world", () => {
    expect(annotationsFor("read", "Find roles", { destructiveHint: true })).toEqual({
      title: "Find roles",
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    });
    expect(annotationsFor("sensitive_write", "Approve", { destructiveHint: true })).toMatchObject({ readOnlyHint: false, destructiveHint: true, idempotentHint: false });
  });
});

describe("tool classes", () => {
  it("classifies every tool as docs/MUSE_CONNECTOR_NOTES.md says", () => {
    const classes = Object.fromEntries(INROAD_TOOLS.map((tool) => [tool.name, tool.museClass]));
    expect(classes).toEqual({
      find_roles: "read",
      find_warm_path: "read",
      get_campaign: "read",
      draft_outreach: "write",
      propose_campaign: "write",
      prepare_application: "write",
      record_submission: "write",
      run_weekly_pass: "write",
      approve_campaign: "sensitive_write",
      submit_application: "sensitive_write",
    });
    expect(toolsForScope("read").map((t) => t.name)).toEqual(["find_roles", "find_warm_path", "get_campaign"]);
    expect(toolsForScope("write")).toHaveLength(10);
  });
});

describe("toolErrorMessage", () => {
  const ctx = { tool: "find_roles", userId: "u1" };

  it("passes through user-safe service messages", () => {
    expect(toolErrorMessage(new ToolRefusal("Nope."), ctx)).toBe("Nope.");
    expect(toolErrorMessage(new CampaignError("not_found", "No such version."), ctx)).toBe("No such version.");
    expect(toolErrorMessage(new ApplicationError("invalid_state", "Not ready."), ctx)).toBe("Not ready.");
    expect(toolErrorMessage(new OutreachError("not_found", "Contact not found."), ctx)).toBe("Contact not found.");
  });

  it("logs anything else and returns a generic message", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(toolErrorMessage(new Error("SELECT * FROM users"), ctx)).toBe(GENERIC_TOOL_ERROR);
    expect(log).toHaveBeenCalledWith("[mcp] tool failed", expect.objectContaining({ tool: "find_roles", userId: "u1" }));
    log.mockRestore();
  });
});

describe("tool call audit failure", () => {
  const echoTool = defineTool({
    name: "echo_tool",
    title: "Echo",
    museClass: "write",
    description: "Test tool.",
    input: z.strictObject({ word: z.string() }),
    output: z.object({ word: z.string() }),
    auditArgs: (input) => ({ word: input.word }),
    run: async (_ctx, input) => ({ data: { word: input.word }, summary: `Echoed ${input.word}.` }),
  });

  async function connected(): Promise<Client> {
    const server = new McpServer({ name: "test", version: "0.0.0" });
    echoTool.register(server, toolContext({ userId: "u1", scope: "write" }));
    const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
    await server.connect(serverSide);
    const client = new Client({ name: "test-client", version: "0.0.0" });
    await client.connect(clientSide);
    return client;
  }

  it("still returns the tool's result when the muse.<tool> audit write fails, and logs no details to Muse", async () => {
    const create = vi.spyOn(db.auditEvent, "create").mockRejectedValueOnce(new Error("SQLITE_BUSY at /secret/path"));
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = await connected();
    const result = await client.callTool({ name: "echo_tool", arguments: { word: "hi" } });
    await client.close();
    create.mockRestore();

    expect(result.isError).toBeFalsy();
    expect(result.structuredContent).toEqual({ word: "hi" });
    expect(JSON.stringify(result.content)).not.toContain("SQLITE_BUSY");
    expect(log).toHaveBeenCalledWith("[mcp] audit write failed", expect.objectContaining({ tool: "echo_tool", userId: "u1" }));
    log.mockRestore();
  });
});
