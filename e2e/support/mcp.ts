import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

// A real MCP client (the official SDK) talking to /mcp with a connector token, as Muse would.

export async function connectMuse(endpoint: URL, token: string): Promise<Client> {
  const client = new Client({ name: "inroad-e2e", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${token}` } } });
  await client.connect(transport);
  return client;
}

export interface ToolResult {
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
}

export async function callTool(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const result = await client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : "")).join("\n");
  return { isError: result.isError === true, text, data: (result.structuredContent as Record<string, unknown> | undefined) ?? {} };
}
