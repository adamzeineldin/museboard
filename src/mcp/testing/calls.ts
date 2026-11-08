import type { Client } from "@modelcontextprotocol/sdk/client/index.js";

// Test-only: call a tool and unpack the result.

export interface ToolCall {
  isError: boolean;
  text: string;
  data: Record<string, unknown>;
}

export async function call(client: Client, name: string, args: Record<string, unknown> = {}): Promise<ToolCall> {
  const result = await client.callTool({ name, arguments: args });
  const content = Array.isArray(result.content) ? result.content : [];
  const text = content.map((part) => (part && typeof part === "object" && "text" in part ? String(part.text) : "")).join("\n");
  return {
    isError: result.isError === true,
    text,
    data: (result.structuredContent as Record<string, unknown> | undefined) ?? {},
  };
}
