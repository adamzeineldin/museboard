"use server";

import { z } from "zod";
import { LINK_MESSAGES, unsubscribeFromLink, type LinkOutcome } from "@/lib/digest";
import { MAX_TOKEN_LENGTH } from "@/lib/digest/tokens";

// No session needed: the signed token authorises exactly one thing, turning off this user's digest.

const tokenSchema = z.string().trim().min(1).max(MAX_TOKEN_LENGTH);

export async function unsubscribeAction(_previous: LinkOutcome, formData: FormData): Promise<LinkOutcome> {
  const token = tokenSchema.safeParse(formData.get("token"));
  if (!token.success) return { status: "invalid", message: LINK_MESSAGES.invalid };
  return unsubscribeFromLink(token.data);
}
