import type { RuleCheckResult } from "@/lib/rules";
import type { RoleStatus } from "../schemas";

// Pure: turn loaded jobs, matches, applications, rule results and contact counts into find_roles rows.

export const FIND_ROLES_LIMIT = 50;
export const NEW_ROLE_DAYS = 7;

export interface RoleJobInput {
  id: string;
  title: string;
  companyName: string;
  location: string;
  type: string;
  url: string;
  postedAt: Date | null;
  firstSeenAt: Date;
}

export interface RoleApplicationInput {
  id: string;
  status: string;
  reason: string;
}

export interface RoleRow {
  jobId: string;
  title: string;
  company: string;
  location: string;
  type: string;
  url: string;
  postedAt: string | null;
  firstSeenAt: string;
  matchScore: number | null;
  status: RoleStatus;
  reason: string;
  applicationId: string | null;
  warmPath: boolean;
  warmPathContacts: number;
}

export interface RoleRowsInput {
  jobs: readonly (RoleJobInput & { companyId: string })[];
  scores: ReadonlyMap<string, number>;
  applications: ReadonlyMap<string, RoleApplicationInput>;
  ruleResults: ReadonlyMap<string, RuleCheckResult | null>;
  contactCounts: ReadonlyMap<string, number>;
  limit?: number;
}

const APPLICATION_STATUSES: ReadonlySet<string> = new Set(["prepared", "waiting", "submitted", "skipped"]);

/** Status from the existing Application when there is one, otherwise from the rule check. */
export function roleStatus(
  application: RoleApplicationInput | undefined,
  rule: RuleCheckResult | null | undefined,
): { status: RoleStatus; reason: string } {
  if (application && APPLICATION_STATUSES.has(application.status)) {
    return { status: application.status as RoleStatus, reason: application.reason };
  }
  if (!rule) return { status: "held", reason: "Rule check unavailable" };
  if (rule.ok) return { status: "will_auto_apply", reason: rule.reason };
  return { status: rule.topChoice ? "referral_first" : "held", reason: rule.reason };
}

/** Best match first (unscored last), then newest first seen; at most `limit` rows. */
export function buildRoleRows(input: RoleRowsInput): RoleRow[] {
  const rows = input.jobs.map((job): { row: RoleRow; seen: number } => {
    const application = input.applications.get(job.id);
    const contacts = input.contactCounts.get(job.companyId) ?? 0;
    const row: RoleRow = {
      jobId: job.id,
      title: job.title,
      company: job.companyName,
      location: job.location,
      type: job.type,
      url: job.url,
      postedAt: job.postedAt ? job.postedAt.toISOString() : null,
      firstSeenAt: job.firstSeenAt.toISOString(),
      matchScore: input.scores.get(job.id) ?? null,
      ...roleStatus(application, input.ruleResults.get(job.id)),
      applicationId: application?.id ?? null,
      warmPath: contacts > 0,
      warmPathContacts: contacts,
    };
    return { row, seen: job.firstSeenAt.getTime() };
  });
  const score = (row: RoleRow): number => row.matchScore ?? -1;
  return [...rows]
    .sort((a, b) => score(b.row) - score(a.row) || b.seen - a.seen || a.row.jobId.localeCompare(b.row.jobId))
    .slice(0, input.limit ?? FIND_ROLES_LIMIT)
    .map(({ row }) => row);
}
