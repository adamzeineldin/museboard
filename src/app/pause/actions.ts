"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { LINK_MESSAGES, pauseCampaignFromLink, type LinkOutcome } from "@/lib/digest";
import { MAX_TOKEN_LENGTH } from "@/lib/digest/tokens";

// No session needed: the signed token in the form authorises exactly one thing, pausing the campaign it
// names for the user it names. The service verifies it again on every call.

const tokenSchema = z.string().trim().min(1).max(MAX_TOKEN_LENGTH);

export async function pauseCampaignAction(_previous: LinkOutcome, formData: FormData): Promise<LinkOutcome> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { status: "invalid", message: LINK_MESSAGES.invalid };
  const outcome = await pauseCampaignFromLink(token.data);
  if (outcome.status === "done") revalidatePath("/", "layout");
  return outcome;
}
