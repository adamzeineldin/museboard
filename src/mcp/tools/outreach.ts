import "server-only";
import { z } from "zod";
import { draftOutreach } from "@/lib/outreach";
import { ReferralPacketSchema } from "@/lib/packet-types";
import { idSchema, outreachKindInput } from "../schemas";
import { defineTool } from "../tool-kit";

// Write tool: draft_outreach. Creates an Outreach draft; never sends anything (ground rule 4).

export const NOT_SENT_NOTE = "Inroad never sends messages. The user copies this draft and sends it from their own account.";

export const draftOutreachTool = defineTool({
  name: "draft_outreach",
  title: "Draft outreach",
  museClass: "write",
  description: [
    "Muse class: Write. Side effect: saves a new outreach draft in the user's Inroad account (status draft).",
    "Drafts a short coffee-chat or referral-ask message to one of the user's saved contacts (contactId from find_warm_path),",
    "optionally about one job (jobId from find_roles), and returns the text plus a referral packet: the role link, a three-line fit summary and the user's resume.",
    NOT_SENT_NOTE,
    "Inroad never offers money or rewards for referrals.",
  ].join(" "),
  input: z.strictObject({
    contactId: idSchema("contactId"),
    jobId: idSchema("jobId").optional(),
    kind: outreachKindInput.describe('"coffee_chat" or "referral_ask"'),
  }),
  hints: { destructiveHint: false, idempotentHint: false },
  output: z.object({
    outreachId: z.string(),
    kind: outreachKindInput,
    status: z.literal("draft"),
    draft: z.string(),
    packet: ReferralPacketSchema,
    note: z.string(),
  }),
  auditArgs: (input) => ({ contactId: input.contactId, jobId: input.jobId ?? null, kind: input.kind }),
  async run(ctx, input) {
    const result = await draftOutreach(ctx.userId, input.contactId, input.kind, input.jobId, "muse");
    const label = input.kind === "referral_ask" ? "referral ask" : "coffee-chat message";
    return {
      data: {
        outreachId: result.outreach.id,
        kind: input.kind,
        status: "draft" as const,
        draft: result.draft,
        packet: result.packet,
        note: NOT_SENT_NOTE,
      },
      summary: `Drafted a ${label}. ${NOT_SENT_NOTE}`,
    };
  },
});
