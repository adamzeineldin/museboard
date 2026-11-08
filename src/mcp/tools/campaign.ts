import "server-only";
import { z } from "zod";
import type { CampaignVersion } from "@/generated/prisma/client";
import { approveVersion, getCampaignState, proposeVersion, summarizeRules } from "@/lib/campaign";
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

export const getCampaignTool = defineTool({
  name: "get_campaign",
  title: "Get campaign",
  museClass: "read",
  description: [
    "Muse class: Read. No side effects (Inroad only records that the tool was called).",
    "Returns the user's campaign: its status (active, paused or none), the rules in force (the newest version the user approved) with a plain-English summary,",
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
    const status = state.campaign ? CampaignStatusOutput.catch("paused").parse(state.campaign.status) : "none";
    const parts = [
      status === "none" ? "No campaign yet." : `Campaign is ${status}.`,
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
    "Muse class: Write. Side effect: saves the rules as a pending, unapproved campaign version (replacing any earlier pending version).",
    NOTHING_CHANGES,
    "Returns the plain-English summary of the proposed rules and its versionId. Show the user that summary; approving it is a separate step (approve_campaign).",
    "rules: roles (intern, newgrad), autoCompanies, askFirstCompanies (companies Inroad never applies to without asking; it drafts a referral ask instead),",
    "resumeId, weeklyCap (1-20), minMatch (50-100) and endsOn (YYYY-MM-DD).",
  ].join(" "),
  input: z.strictObject({ rules: CampaignRulesSchema }),
  hints: { destructiveHint: false, idempotentHint: true },
  output: z.object({
    versionId: z.string(),
    approved: z.literal(false),
    summary: z.array(z.string()),
    inForceVersionId: z.string().nullable(),
    message: z.string(),
  }),
  auditArgs: (input) => ({ rules: input.rules }),
  async run(ctx, input) {
    const version = await proposeVersion(ctx.userId, input.rules, "muse", ctx.now());
    const [state, summary] = await Promise.all([getCampaignState(ctx.userId), summaryFor(ctx.userId, input.rules)]);
    return {
      data: { versionId: version.id, approved: false as const, summary, inForceVersionId: state.inForce?.id ?? null, message: NOTHING_CHANGES },
      summary: `Proposed new campaign rules (pending). ${NOTHING_CHANGES}`,
    };
  },
});

export const approveCampaignTool = defineTool({
  name: "approve_campaign",
  title: "Approve campaign rules",
  museClass: "sensitive_write",
  description: [
    "Muse class: Sensitive write. Side effect: approves a pending campaign version, recorded as approved via Muse.",
    "From then on Inroad prepares applications under these rules (the version replaces the rules in force; a first approval also activates the campaign).",
    "Before calling this, Muse must show the user the summary returned by propose_campaign for this exact versionId and get an explicit yes from the user.",
    "If the rules change after that, propose them again and ask again.",
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
    const version = await approveVersion(ctx.userId, input.versionId, "muse", ctx.now());
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
