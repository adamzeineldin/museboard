import "server-only";
import type { McpServer, ToolCallback } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult, ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";
import type { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { ToolContext } from "./context";
import { toolErrorMessage } from "./errors";

// Shared plumbing for every Inroad tool: Muse class -> MCP annotations, the audit entry each call writes
// (actor 'muse', action 'muse.<tool>', feeds the docked Muse activity panel), structured output plus a
// text summary, and safe error results.

/** Muse connector guideline 3.2 classes (docs/MUSE_CONNECTOR_NOTES.md). */
export type MuseClass = "read" | "write" | "sensitive_write";

export const MUSE_CLASS_LABELS: Record<MuseClass, string> = {
  read: "Read",
  write: "Write",
  sensitive_write: "Sensitive write",
};

export interface ToolOutcome<O> {
  data: O;
  /** One or two plain sentences for the text content and the activity panel. */
  summary: string;
}

type ObjectSchema = z.ZodObject;

export interface ToolSpec<I extends ObjectSchema, O extends ObjectSchema> {
  name: string;
  title: string;
  museClass: MuseClass;
  description: string;
  input: I;
  output: O;
  /** Annotation hints beyond the class defaults (read tools are read-only and idempotent). */
  hints?: Pick<ToolAnnotations, "destructiveHint" | "idempotentHint">;
  /** Non-sensitive arguments to record in the audit entry. */
  auditArgs: (input: z.output<I>) => Record<string, unknown>;
  run: (ctx: ToolContext, input: z.output<I>) => Promise<ToolOutcome<z.output<O>>>;
}

/** A tool with its generics erased, ready to register on a server for one user. */
export interface InroadTool {
  name: string;
  museClass: MuseClass;
  annotations: ToolAnnotations;
  register: (server: McpServer, ctx: ToolContext) => void;
}

const MAX_AUDIT_SUMMARY = 300;

export function annotationsFor(museClass: MuseClass, title: string, hints: ToolSpec<ObjectSchema, ObjectSchema>["hints"] = {}): ToolAnnotations {
  const read = museClass === "read";
  return {
    title,
    readOnlyHint: read,
    destructiveHint: read ? false : (hints.destructiveHint ?? false),
    idempotentHint: read ? true : (hints.idempotentHint ?? false),
    openWorldHint: false,
  };
}

export async function auditCall(ctx: ToolContext, tool: string, payload: Record<string, unknown>): Promise<void> {
  try {
    await writeAudit(ctx.userId, "muse", `muse.${tool}`, payload);
  } catch (error) {
    // The tool's own effect is already audited by the service it called; log loudly so the gap is visible.
    console.error("[mcp] audit write failed", { tool, userId: ctx.userId, error: error instanceof Error ? error.message : String(error) });
  }
}

export const clipSummary = (text: string): string => (text.length > MAX_AUDIT_SUMMARY ? `${text.slice(0, MAX_AUDIT_SUMMARY - 1)}…` : text);

const textResult = (text: string): CallToolResult["content"] => [{ type: "text", text }];

async function execute<I extends ObjectSchema, O extends ObjectSchema>(
  ctx: ToolContext,
  spec: ToolSpec<I, O>,
  input: z.output<I>,
): Promise<CallToolResult> {
  const args = spec.auditArgs(input);
  try {
    const { data, summary } = await spec.run(ctx, input);
    await auditCall(ctx, spec.name, { args, ok: true, summary: clipSummary(summary) });
    return { content: textResult(summary), structuredContent: data as Record<string, unknown> };
  } catch (error) {
    const message = toolErrorMessage(error, { tool: spec.name, userId: ctx.userId });
    await auditCall(ctx, spec.name, { args, ok: false, summary: clipSummary(message) });
    return { content: textResult(message), isError: true };
  }
}

export function defineTool<I extends ObjectSchema, O extends ObjectSchema>(spec: ToolSpec<I, O>): InroadTool {
  const annotations = annotationsFor(spec.museClass, spec.title, spec.hints);
  return {
    name: spec.name,
    museClass: spec.museClass,
    annotations,
    register(server, ctx) {
      const callback = ((input: z.output<I>) => execute(ctx, spec, input)) as unknown as ToolCallback<I>;
      server.registerTool(
        spec.name,
        { title: spec.title, description: spec.description, inputSchema: spec.input, outputSchema: spec.output, annotations },
        callback,
      );
    },
  };
}
