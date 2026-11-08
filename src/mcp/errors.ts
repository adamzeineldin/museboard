import "server-only";
import { isApplicationError } from "@/lib/applications";
import { isCampaignError } from "@/lib/campaign";
import { OutreachError } from "@/lib/outreach";

// Map anything a tool throws to a message that is safe to hand to Muse (and so to the user).
// Service errors carry user-safe messages by contract. Anything else is logged server side and replaced
// with a generic message, so stack traces, SQL and other users' data never reach the connector.

export const GENERIC_TOOL_ERROR = "Something went wrong in Inroad. Try again in a moment.";

/** A refusal the tool decided on (e.g. submit_application when the rule check fails). Message is user-safe. */
export class ToolRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ToolRefusal";
  }
}

export interface ToolErrorContext {
  tool: string;
  userId: string;
}

function knownMessage(error: unknown): string | null {
  if (error instanceof ToolRefusal) return error.message;
  if (isCampaignError(error) || isApplicationError(error) || error instanceof OutreachError) return error.message;
  return null;
}

export function toolErrorMessage(error: unknown, context: ToolErrorContext): string {
  const known = knownMessage(error);
  if (known) return known;
  console.error("[mcp] tool failed", {
    ...context,
    error: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
  });
  return GENERIC_TOOL_ERROR;
}
