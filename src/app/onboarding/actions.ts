"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { profileSchema } from "@/lib/profile";

export interface OnboardingState {
  fieldErrors: Partial<Record<"name" | "school" | "gradYear" | "timezone", string>>;
  formError: string | null;
}

export async function saveProfile(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  const parsed = profileSchema.safeParse({
    name: formData.get("name") ?? "",
    school: formData.get("school") ?? "",
    gradYear: formData.get("gradYear") ?? "",
    timezone: formData.get("timezone") ?? "",
  });
  if (!parsed.success) {
    const fieldErrors: OnboardingState["fieldErrors"] = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if ((key === "name" || key === "school" || key === "gradYear" || key === "timezone") && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    return { fieldErrors, formError: null };
  }

  try {
    await db.user.update({ where: { id: user.id }, data: parsed.data });
    await writeAudit(user.id, "user", "profile.updated", { fields: Object.keys(parsed.data) });
  } catch (error) {
    console.error("[onboarding] saving profile failed", { userId: user.id, error: error instanceof Error ? error.message : error });
    return { fieldErrors: {}, formError: "We couldn't save your profile. Try again." };
  }
  redirect("/jobs");
}
