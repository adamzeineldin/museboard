import { outreachKindSchema, type OutreachKind } from "@/lib/types";

// Pure helpers for the Warm paths page. Selection lives in the URL (?contact=&job=&kind=) so the Jobs page
// can link straight to a draft.

export const WARM_PATHS_PATH = "/warm-paths";
const MAX_ID = 200;
/** ?job=none: the user chose "No specific role" (otherwise the newest open job is picked). */
export const NO_JOB = "none";

export interface WarmPathParams {
  contactId: string | null;
  jobId: string | null;
  kind: OutreachKind;
}

export type RawSearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined): string | null {
  const first = Array.isArray(value) ? value[0] : value;
  const trimmed = first?.trim() ?? "";
  return trimmed && trimmed.length <= MAX_ID ? trimmed : null;
}

export function parseWarmPathParams(params: RawSearchParams): WarmPathParams {
  const kind = outreachKindSchema.safeParse(single(params.kind));
  return { contactId: single(params.contact), jobId: single(params.job), kind: kind.success ? kind.data : "coffee_chat" };
}

export function warmPathsHref(params: WarmPathParams): string {
  const search = new URLSearchParams();
  if (params.contactId) search.set("contact", params.contactId);
  if (params.jobId) search.set("job", params.jobId);
  if (params.kind !== "coffee_chat") search.set("kind", params.kind);
  const query = search.toString();
  return query ? `${WARM_PATHS_PATH}?${query}` : WARM_PATHS_PATH;
}

/** The requested job if it is one of the company's open jobs, else the newest open job, else null. NO_JOB means none. */
export function pickJobId(openJobs: ReadonlyArray<{ id: string }>, requested: string | null): string | null {
  if (requested === NO_JOB) return null;
  if (requested && openJobs.some((job) => job.id === requested)) return requested;
  return openJobs[0]?.id ?? null;
}

/** "Priya N." -> "PN": first and last word initials. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const first = words[0][0] ?? "";
  const last = words.length > 1 ? (words[words.length - 1][0] ?? "") : "";
  return `${first}${last}`.toUpperCase();
}

export const KIND_LABELS: Record<OutreachKind, string> = {
  coffee_chat: "Coffee chat",
  referral_ask: "Referral ask",
};

export function panelLabel(kind: OutreachKind, contactName: string): string {
  return kind === "coffee_chat" ? `Coffee chat request to ${contactName}` : `Referral ask to ${contactName}`;
}
