import "server-only";
import type { User } from "@/generated/prisma/client";
import { localDateString } from "@/lib/rules";
import { approvedViaSchema, CampaignRulesSchema, type ApprovedVia, type CampaignRules } from "@/lib/types";
import type { DbClient } from "./client";
import { CampaignError } from "./errors";

/** Validate rules from any caller (web form, MCP tool input). Throws CampaignError with the first issue. */
export function parseRulesOrThrow(rules: unknown): CampaignRules {
  const parsed = CampaignRulesSchema.safeParse(rules);
  if (parsed.success) return parsed.data;
  const issue = parsed.error.issues[0];
  const field = issue?.path.join(".");
  throw new CampaignError("invalid_rules", field ? `Check ${field}: ${issue.message}` : "Those campaign rules aren't valid.");
}

export function parseViaOrThrow(via: unknown): ApprovedVia {
  const parsed = approvedViaSchema.safeParse(via);
  if (!parsed.success) throw new CampaignError("invalid_rules", "Unknown approval channel.");
  return parsed.data;
}

export async function loadUserOrThrow(client: DbClient, userId: string): Promise<User> {
  const user = await client.user.findUnique({ where: { id: userId } });
  if (!user) throw new CampaignError("not_found", "We couldn't find your account. Sign in again.");
  return user;
}

/** endsOn is an inclusive calendar date in the user's zone: today is fine, yesterday is not. */
export function assertEndsOnNotPast(endsOn: string, timeZone: string, now: Date, message: string): void {
  if (endsOn < localDateString(now, timeZone)) throw new CampaignError("ended", message);
}

export async function assertResumeOwned(client: DbClient, userId: string, resumeId: string): Promise<void> {
  const resume = await client.resume.findFirst({ where: { id: resumeId, userId }, select: { id: true } });
  if (!resume) throw new CampaignError("invalid_rules", "Pick one of your own resumes.");
}
