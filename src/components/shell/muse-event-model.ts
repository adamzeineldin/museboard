export interface MuseEventInput {
  id: string;
  action: string;
  payload: unknown;
  createdAt: Date;
}

export interface MuseEventModel {
  id: string;
  tool: string;
  summary: string | null;
  /** The tool call returned an error (its audit payload has ok: false). */
  failed: boolean;
  createdAt: Date;
}

const SUMMARY_KEYS = ["summary", "reason", "result"] as const;
const MAX_SUMMARY = 140;
// MCP tool calls are audited as `muse.<tool>` (src/mcp/tool-kit.ts); the panel names them `inroad.<tool>` like the prototype.
const TOOL_ACTION_PREFIX = "muse.";

function asRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Record<string, unknown>) : null;
}

function summaryOf(record: Record<string, unknown> | null): string | null {
  if (!record) return null;
  const key = SUMMARY_KEYS.find((k) => typeof record[k] === "string" && (record[k] as string).trim());
  if (!key) return null;
  const text = (record[key] as string).trim();
  return text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY - 1)}…` : text;
}

/** Turn a Muse tool-call AuditEvent (actor 'muse', action `muse.<tool>`) into a row for the Muse activity panel. */
export function museEventModel(event: MuseEventInput): MuseEventModel {
  const tool = event.action.startsWith(TOOL_ACTION_PREFIX) ? `inroad.${event.action.slice(TOOL_ACTION_PREFIX.length)}` : event.action;
  const record = asRecord(event.payload);
  return { id: event.id, tool, summary: summaryOf(record), failed: record?.ok === false, createdAt: event.createdAt };
}
