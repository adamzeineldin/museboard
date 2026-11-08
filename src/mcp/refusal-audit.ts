import "server-only";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getMethodLiteral } from "@modelcontextprotocol/sdk/server/zod-json-schema-compat.js";
import { z } from "zod";
import type { ToolContext } from "./context";
import { auditCall, clipSummary } from "./tool-kit";

// The SDK answers some tool calls before any Inroad tool runs: a tool the token's scope does not include
// ("Tool <name> not found") and arguments that fail the input schema ("Input validation error"). Those never
// reach execute() in tool-kit.ts, so audit them here as muse.<tool> with ok: false. Arguments are not recorded,
// because they failed validation and may hold anything.

// Tool names come from the client and may hold any character, spaces and newlines included.
const SDK_REFUSAL = /^MCP error -32602: (Tool [\s\S]+ (not found|disabled)|Input validation error)/;
const CALL_TOOL_METHOD = "tools/call";
const UNKNOWN_TOOL = "unknown_tool";
const MAX_TOOL_NAME = 64;
const CONTROL_CHARS = /\p{Cc}/gu;

const CallShape = z.object({ params: z.object({ name: z.string() }) });
const ErrorResultShape = z.object({
  isError: z.literal(true),
  content: z.array(z.object({ type: z.literal("text"), text: z.string() })).min(1),
});

export interface RefusalAudit {
  /** True once the tools/call handler is wrapped; logs an error when it is not, so the audit gap is visible. */
  assertInstalled: () => boolean;
}

async function auditIfRefused(ctx: ToolContext, toolNames: ReadonlySet<string>, request: unknown, result: unknown): Promise<void> {
  const refusal = ErrorResultShape.safeParse(result);
  if (!refusal.success) return;
  const text = refusal.data.content[0].text;
  if (!SDK_REFUSAL.test(text)) return;
  const name = CallShape.safeParse(request).data?.params.name ?? "";
  if (toolNames.has(name)) {
    await auditCall(ctx, name, { args: {}, ok: false, summary: clipSummary(text) });
    return;
  }
  const clipped = name.slice(0, MAX_TOOL_NAME);
  await auditCall(ctx, UNKNOWN_TOOL, { args: { tool: clipped }, ok: false, summary: unknownToolSummary(clipped) });
}

// The SDK's text repeats the raw name at any length and with any characters, so the summary is rebuilt
// from the clipped name with control characters (newlines included) replaced by spaces.
function unknownToolSummary(clippedName: string): string {
  return `Tool ${clippedName.replace(CONTROL_CHARS, " ")} not found`;
}

function methodOf(schema: unknown): string | null {
  try {
    return getMethodLiteral(schema as Parameters<typeof getMethodLiteral>[0]);
  } catch {
    return null; // the SDK's own setRequestHandler rejects such a schema with its own error
  }
}

/**
 * Wrap the tools/call handler the McpServer installs so SDK refusals are audited. Call it before the
 * first tool is registered (McpServer installs its tools/call handler on the first registerTool), then call
 * assertInstalled() once the tools are registered. The handler is matched by its method, not its schema object.
 */
export function auditSdkRefusals(server: McpServer, ctx: ToolContext, toolNames: ReadonlySet<string>): RefusalAudit {
  const inner = server.server;
  const setHandler = inner.setRequestHandler.bind(inner);
  let installed = false;
  const patched: typeof inner.setRequestHandler = (schema, handler) => {
    if (methodOf(schema) !== CALL_TOOL_METHOD) return setHandler(schema, handler);
    installed = true;
    return setHandler(schema, async (request, extra) => {
      const result = await handler(request, extra);
      await auditIfRefused(ctx, toolNames, request, result);
      return result;
    });
  };
  inner.setRequestHandler = patched;
  return {
    assertInstalled() {
      if (!installed) {
        console.error("[mcp] refusal audit is not installed: no tools/call handler was wrapped, so SDK refusals will not be audited", {
          userId: ctx.userId,
        });
      }
      return installed;
    },
  };
}
