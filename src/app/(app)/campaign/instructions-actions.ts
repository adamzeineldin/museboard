"use server";

import { revalidatePath } from "next/cache";
import type { InstructionsState } from "@/components/campaign/instructions-state";
import { getSessionUserId } from "@/lib/current-user";
import { museInstructionsSchema, saveMuseInstructions } from "@/lib/muse-instructions";

// Rules → Instructions for Muse. The user comes from the session; the form carries only the text.

export async function saveMuseInstructionsAction(_prev: InstructionsState, formData: FormData): Promise<InstructionsState> {
  const raw = String(formData.get("instructions") ?? "");
  const userId = await getSessionUserId();
  if (!userId) return { status: "error", message: "Your session ended. Sign in again.", value: raw };
  const parsed = museInstructionsSchema.safeParse(raw);
  if (!parsed.success) return { status: "error", message: parsed.error.issues[0]?.message ?? "Check the text and try again.", value: raw };
  try {
    const saved = await saveMuseInstructions(userId, parsed.data);
    revalidatePath("/campaign");
    return {
      status: "success",
      message: saved ? "Saved. Muse gets these the next time it checks your rules." : "Cleared. Muse follows your rules only.",
      value: saved ?? "",
    };
  } catch (error) {
    console.error("[campaign] save Muse instructions failed", { userId, error: error instanceof Error ? error.message : error });
    return { status: "error", message: "We couldn't save that. Nothing changed. Try again.", value: raw };
  }
}
