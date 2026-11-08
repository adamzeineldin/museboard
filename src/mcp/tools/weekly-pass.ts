import "server-only";
import { z } from "zod";
import { runWeeklyPass } from "@/lib/applications";
import { defineTool } from "../tool-kit";

// Write tool: run_weekly_pass. Runs the same weekly pass as the scheduled worker, as the user's connector.

const count = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export const runWeeklyPassTool = defineTool({
  name: "run_weekly_pass",
  title: "Run weekly pass",
  museClass: "write",
  description: [
    "Muse class: Write. Side effects: creates application records in Inroad (each with an audit entry) and may save referral-ask drafts; it submits nothing and sends nothing.",
    "Runs prepare_application for every new match the user's approved campaign covers (open jobs at campaign companies and role types, at or above the minimum match, with no application yet), best match first.",
    "Returns company and title lists: submitted (cleared to submit, status prepared; send them with submit_application),",
    "waiting (held for the user's approval, e.g. weekly limit or a top-choice company), and referralDrafts (top-choice roles a referral ask was drafted for).",
    "If the campaign can't run (no approved rules, paused or ended) nothing is created and reason says why.",
  ].join(" "),
  input: z.strictObject({}),
  hints: { destructiveHint: false, idempotentHint: false },
  output: z.object({
    submitted: z.array(z.string()),
    waiting: z.array(z.string()),
    referralDrafts: z.array(z.string()),
    failed: z.array(z.string()),
    reason: z.string().nullable(),
  }),
  auditArgs: () => ({}),
  async run(ctx) {
    const result = await runWeeklyPass(ctx.userId, "muse", ctx.now());
    const data = {
      submitted: result.submitted,
      waiting: result.waiting,
      referralDrafts: result.referralDrafts,
      failed: result.failed ?? [],
      reason: result.reason ?? null,
    };
    const summary = data.reason
      ? `Weekly pass didn't run: ${data.reason}.`
      : `Weekly pass: ${count(data.submitted.length, "application")} cleared to submit, ${data.waiting.length} waiting on the user, ${count(data.referralDrafts.length, "referral ask")} drafted.`;
    return { data, summary };
  },
});
