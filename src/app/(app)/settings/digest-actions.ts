"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { DigestToggleState } from "@/components/digest/digest-toggle-state";
import { getSessionUserId } from "@/lib/current-user";
import { DigestPreferenceError, setDigestEnabled } from "@/lib/digest";

// Settings → Weekly digest. The user comes from the session; the form only says on or off.

const enabledSchema = z.enum(["on", "off"]);

const result = (status: DigestToggleState["status"], message: string, enabled: boolean | null): DigestToggleState => ({
  status,
  message,
  enabled,
  nonce: Date.now(),
});

export async function setDigestPreferenceAction(_prev: DigestToggleState, formData: FormData): Promise<DigestToggleState> {
  const userId = await getSessionUserId();
  if (!userId) return result("error", "Your session ended. Sign in again.", null);
  const parsed = enabledSchema.safeParse(formData.get("digest"));
  if (!parsed.success) return result("error", "Choose on or off.", null);
  try {
    const { enabled } = await setDigestEnabled(userId, parsed.data === "on");
    revalidatePath("/settings");
    return result(
      "success",
      enabled
        ? "Weekly digest is on. It arrives on Monday mornings."
        : "Weekly digest is off. Your campaign and applications don't change.",
      enabled,
    );
  } catch (error) {
    if (error instanceof DigestPreferenceError) return result("error", error.message, null);
    console.error("[settings] digest preference failed", { userId, error: error instanceof Error ? error.message : error });
    return result("error", "We couldn't save that. Nothing changed. Try again.", null);
  }
}
