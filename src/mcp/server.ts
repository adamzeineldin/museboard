import "server-only";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { toolContext, type InroadServerOptions } from "./context";
import type { InroadTool } from "./tool-kit";
import { approveCampaignTool, getCampaignTool, proposeCampaignTool } from "./tools/campaign";
import { findRolesTool, findWarmPathTool } from "./tools/discovery";
import { draftOutreachTool } from "./tools/outreach";
import { prepareApplicationTool, recordSubmissionTool, submitApplicationTool } from "./tools/applications";
import { runWeeklyPassTool } from "./tools/weekly-pass";

// The Inroad MCP server for one authenticated user (brief sec. 6). A fresh server is built per request
// (stateless streamable HTTP, src/mcp/http/handler.ts). Read-scope tokens only get the Read tools.

export const SERVER_INFO = { name: "inroad", version: "0.1.0" } as const;

export const INROAD_TOOLS: readonly InroadTool[] = [
  findRolesTool,
  findWarmPathTool,
  draftOutreachTool,
  getCampaignTool,
  proposeCampaignTool,
  approveCampaignTool,
  prepareApplicationTool,
  submitApplicationTool,
  recordSubmissionTool,
  runWeeklyPassTool,
];

const INSTRUCTIONS = [
  "Inroad is a job-search copilot for students looking for SWE internships and new-grad roles.",
  "Each tool description states its Muse class (Read, Write or Sensitive write) and its side effects.",
  "Inroad applies only inside a campaign the user approved; rule changes stay pending until the user approves them.",
  "Inroad drafts outreach but never sends messages, and it never submits applications itself.",
].join(" ");

export function toolsForScope(scope: InroadServerOptions["scope"]): readonly InroadTool[] {
  return scope === "write" ? INROAD_TOOLS : INROAD_TOOLS.filter((tool) => tool.museClass === "read");
}

export function createInroadMcpServer(options: InroadServerOptions): McpServer {
  const ctx = toolContext(options);
  const server = new McpServer(SERVER_INFO, { instructions: INSTRUCTIONS });
  for (const tool of toolsForScope(ctx.scope)) tool.register(server, ctx);
  return server;
}
