import "server-only";
import { z } from "zod";
import type { CampaignVersion } from "@/generated/prisma/client";
import {
  approveVersion,
  getCampaignState,
  isCampaignError,
  proposeRules,
  summarizeRules,
  type ProposalResult,
} from "@/lib/campaign";
import { isPastEnd } from "@/lib/campaign/ended";
import { db } from "@/lib/db";
import { getDefaultResume } from "@/lib/resume";
import { CampaignRulesSchema, parseCampaignRules, type CampaignRules } from "@/lib/types";
import { ToolRefusal } from "../errors";
import { CampaignStatusOutput, idSchema, isoString, RulesOutputSchema } from "../schemas";
import { defineTool } from "../tool-kit";

// Campaign tools: get_campaign (Read), propose_campaign (Write), approve_campaign (Sensitive write).
// Ground rule 3: a proposal changes nothing until the user approves it.

const VersionSchema = z.object({
  versionId: z.string(),
  createdAt: isoString,
  approvedAt: isoString.nullable(),
  approvedVia: z.string().nullable(),
  rules: RulesOutputSchema,
  summary: z.array(z.string()),
});
type VersionView = z.infer<typeof VersionSchema>;

const NOTHING_CHANGES = "Nothing changes until the user approves this version; the version in force keeps governing.";
const ALREADY_IN_FORCE = "These rules are already the rules in force. Nothing changed and there is nothing to approve.";
const ALREADY_PENDING = "These rules are already the pending version, so nothing new was saved.";
const withdrawnMessage = (versionId: string | null): string =>
  `These rules are already the rules in force, so the pending version ${versionId ?? ""} was withdrawn and can no longer be approved. There is nothing to approve.`;
const PROPOSAL_LEAD: Record<ProposalResult["outcome"], string> = {
  created: "Proposed new campaign rules (pending).",
  unchanged_pending: "No change to the campaign rules.",
  unchanged_in_force: "No change to the campaign rules.",
  withdrawn_pending: "Withdrew the pending campaign rules.",
};
const PROPOSAL_OUTCOMES = ["created", "unchanged_pending", "unchanged_in_force", "withdrawn_pending"] as const satisfies readonly ProposalResult["outcome"][];
const STALE_NEXT_STEP =
  "Call get_campaign (or propose_campaign again) to get the current pending versionId and its summary, show that summary to the user, and ask again before calling approve_campaign.";

function proposalMessage(result: ProposalResult): string {
  if (result.outcome === "unchanged_in_force") return ALREADY_IN_FORCE;
  if (result.outcome === "withdrawn_pending") return withdrawnMessage(result.supersededVersionId);
  const replaced = result.supersededVersionId
    ? ` It replaces the earlier pending version ${result.supersededVersionId}, which can no longer be approved.`
    : "";
  const prefix = result.outcome === "unchanged_pending" ? `${ALREADY_PENDING} ` : "";
  return `${prefix}${NOTHING_CHANGES}${replaced}`;
}

async function resumeName(userId: string, resumeId: string): Promise<string> {
  const resume = await db.resume.findFirst({ where: { id: resumeId, userId }, select: { filename: true } });
  return resume?.filename ?? "";
}

async function summaryFor(userId: string, rules: CampaignRules): Promise<string[]> {
  return summarizeRules(rules, { resumeName: await resumeName(userId, rules.resumeId) });
}

async function versionView(userId: string, version: CampaignVersion | null): Promise<VersionView | null> {
  const rules = version ? parseCampaignRules(version.rules) : null;
  if (!version || !rules) return null;
  return {
    versionId: version.id,
    createdAt: version.createdAt.toISOString(),
    approvedAt: version.approvedAt?.toISOString() ?? null,
    approvedVia: version.approvedVia,
    rules,
    summary: await summaryFor(userId, rules),
  };
}

async function userTimeZone(userId: string): Promise<string> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { timezone: true } });
  if (!user) throw new ToolRefusal("We couldn't find your account.");
  return user.timezone;
}

function statusSentence(status: z.infer<typeof CampaignStatusOutput>, endsOn: string | null): string {
  if (status === "none") return "No campaign yet.";
  if (status === "ended") return `Campaign ended on ${endsOn ?? "its end date"}. Inroad prepares nothing more until the user approves rules with a new end date.`;
  return `Campaign is ${status}.`;
}

export const getCampaignTool = defineTool({
  name: "get_campaign",
  title: "Get campaign",
  museClass: "read",
  description: [
    "Muse class: Read. No side effects (Inroad only records that the tool was called).",
    "Returns the user's campaign: its status (active, paused, ended or none; ended means an active campaign whose end date has passed, so nothing more is prepared), the rules in force (the newest version the user approved) with a plain-English summary,",
    "and any pending version (edited but not yet approved) with its summary. A pending version changes nothing until the user approves it.",
    "Also returns the user's default resume (its resumeId is what propose_campaign's rules.resumeId expects), or null if none is uploaded.",
  ].join(" "),
  input: z.strictObject({}),
  output: z.object({
    status: CampaignStatusOutput,
    inForce: VersionSchema.nullable(),
    pending: VersionSchema.nullable(),
    defaultResume: z.object({ resumeId: z.string(), filename: z.string() }).nullable(),
  }),
  auditArgs: () => ({}),
  async run(ctx) {
    const state = await getCampaignState(ctx.userId);
    const [inForce, pending, resume] = await Promise.all([
      versionView(ctx.userId, state.inForce),
      versionView(ctx.userId, state.pending),
      getDefaultResume(ctx.userId),
    ]);
    const defaultResume = resume ? { resumeId: resume.id, filename: resume.filename } : null;
    const stored = state.campaign ? CampaignStatusOutput.catch("paused").parse(state.campaign.status) : "none";
    const endsOn = state.rulesInForce?.endsOn ?? null;
    const ended = stored === "active" && endsOn !== null && isPastEnd(endsOn, ctx.now(), await userTimeZone(ctx.userId));
    const status = ended ? "ended" : stored;
    const parts = [
      statusSentence(status, endsOn),
      inForce ? "Rules in force are approved." : "No approved rules yet.",
      pending ? "A changed version is waiting for the user's approval." : "",
    ];
    return { data: { status, inForce, pending, defaultResume }, summary: parts.filter(Boolean).join(" ") };
  },
});

export const proposeCampaignTool = defineTool({
  name: "propose_campaign",
  title: "Propose campaign rules",
  museClass: "write",
  description: [
    "Muse class: Write. Side effect: saves the rules as a new pending, unapproved campaign version. Any earlier pending version is replaced and can no longer be approved.",
    "Proposing rules identical to the pending version returns that version unchanged; rules identical to the ones in force change nothing when nothing is pending,",
    "and withdraw the pending version when one exists (outcome withdrawn_pending: that version can no longer be approved and there is nothing to approve).",
    NOTHING_CHANGES,
    "Returns the plain-English summary of the proposed rules and its versionId. Show the user that summary; approving it is a separate step (approve_campaign) for that exact versionId.",
    "rules: roles (intern, newgrad), autoCompanies, askFirstCompanies (companies Inroad never applies to without asking; it drafts a referral ask instead),",
    "resumeId, weeklyCap (1-20), minMatch (50-100) and endsOn (YYYY-MM-DD).",
  ].join(" "),
  input: z.strictObject({ rules: CampaignRulesSchema }),
  hints: { destructiveHint: false, idempotentHint: true },
  output: z.object({
    versionId: z.string(),
    /** created, unchanged_pending, unchanged_in_force, or withdrawn_pending (the pending version was withdrawn). */
    outcome: z.enum(PROPOSAL_OUTCOMES),
    /** true when versionId is the version in force (the rules are already in force). */
    approved: z.boolean(),
    /** false when nothing was saved or withdrawn (the proposal matched the pending version or the rules in force). */
    changed: z.boolean(),
    summary: z.array(z.string()),
    inForceVersionId: z.string().nullable(),
    replacedVersionId: z.string().nullable(),
    message: z.string(),
  }),
  auditArgs: (input) => ({ rules: input.rules }),
  async run(ctx, input) {
    const result = await proposeRules(ctx.userId, input.rules, "muse", ctx.now());
    // Summarize the stored rules of the returned version: exactly what approve_campaign(versionId) approves.
    const stored = parseCampaignRules(result.version.rules);
    if (!stored) throw new ToolRefusal("Those rules could not be saved. Review them and try again.");
    const [state, summary] = await Promise.all([getCampaignState(ctx.userId), summaryFor(ctx.userId, stored)]);
    const message = proposalMessage(result);
    const lead = PROPOSAL_LEAD[result.outcome];
    return {
      data: {
        versionId: result.version.id,
        outcome: result.outcome,
        approved: result.version.approvedAt !== null,
        changed: result.outcome === "created" || result.outcome === "withdrawn_pending",
        summary,
        inForceVersionId: state.inForce?.id ?? null,
        replacedVersionId: result.supersededVersionId,
        message,
      },
      summary: `${lead} ${message}`,
    };
  },
});

async function approveOrExplain(userId: string, versionId: string, now: Date): Promise<CampaignVersion> {
  try {
    return await approveVersion(userId, versionId, "muse", now);
  } catch (error) {
    if (isCampaignError(error) && error.code === "stale_version") throw new ToolRefusal(`${error.message} ${STALE_NEXT_STEP}`);
    throw error;
  }
}

export const approveCampaignTool = defineTool({
  name: "approve_campaign",
  title: "Approve campaign rules",
  museClass: "sensitive_write",
  description: [
    "Muse class: Sensitive write. Side effect: approves a pending campaign version, recorded as approved via Muse.",
    "From then on Inroad prepares applications under these rules (the version replaces the rules in force; a first approval also activates the campaign).",
    "Before calling this, Muse must show the user the summary returned by propose_campaign (or get_campaign's pending.summary) for this exact versionId and get an explicit yes from the user.",
    "A version's rules never change. Only the current pending version can be approved: if the rules were changed (on the web or by another proposal) after the summary was shown,",
    "this returns an error saying the rules changed and approves nothing; then fetch the latest summary, show it, and ask again.",
  ].join(" "),
  input: z.strictObject({ versionId: idSchema("versionId") }),
  hints: { destructiveHint: true, idempotentHint: false },
  output: z.object({
    versionId: z.string(),
    approvedAt: isoString,
    approvedVia: z.literal("muse"),
    campaignStatus: CampaignStatusOutput,
    summary: z.array(z.string()),
  }),
  auditArgs: (input) => ({ versionId: input.versionId }),
  async run(ctx, input) {
    const version = await approveOrExplain(ctx.userId, input.versionId, ctx.now());
    const rules = parseCampaignRules(version.rules);
    if (!version.approvedAt || !rules) throw new ToolRefusal("That version could not be approved. Review the rules and try again.");
    const state = await getCampaignState(ctx.userId);
    const campaignStatus = state.campaign ? CampaignStatusOutput.catch("paused").parse(state.campaign.status) : "none";
    return {
      data: {
        versionId: version.id,
        approvedAt: version.approvedAt.toISOString(),
        approvedVia: "muse" as const,
        campaignStatus,
        summary: await summaryFor(ctx.userId, rules),
      },
      summary: `Approved the campaign rules. The campaign is ${campaignStatus}.`,
    };
  },
});
