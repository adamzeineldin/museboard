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
  createdAt: Date;
}

const SUMMARY_KEYS = ["summary", "reason", "result"] as const;
const MAX_SUMMARY = 140;

/** Turn an AuditEvent written with actor 'muse' into a row for the Muse activity panel. */
export function museEventModel(event: MuseEventInput): MuseEventModel {
  const tool = event.action.startsWith("tool.") ? `inroad.${event.action.slice(5)}` : event.action;
  let summary: string | null = null;
  if (event.payload && typeof event.payload === "object" && !Array.isArray(event.payload)) {
    const record = event.payload as Record<string, unknown>;
    const key = SUMMARY_KEYS.find((k) => typeof record[k] === "string" && (record[k] as string).trim());
    if (key) {
      const text = (record[key] as string).trim();
      summary = text.length > MAX_SUMMARY ? `${text.slice(0, MAX_SUMMARY - 1)}…` : text;
    }
  }
  return { id: event.id, tool, summary, createdAt: event.createdAt };
}
