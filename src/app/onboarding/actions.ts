"use server";

import { redirect } from "next/navigation";
import { writeAudit } from "@/lib/audit";
import { requireUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { isProfileComplete, profileSchemaFor } from "@/lib/profile";
import { profileFieldErrors, readProfileForm, type OnboardingState } from "./form-state";

export async function saveProfile(_prev: OnboardingState, formData: FormData): Promise<OnboardingState> {
  const user = await requireUser();
  // Onboarding is one-time. A finished profile (stale tab, crafted post) must not rewrite the time zone that sets the week window.
  if (isProfileComplete(user)) redirect("/jobs");

  const values = readProfileForm(formData);
  const parsed = profileSchemaFor(user.timezone).safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: profileFieldErrors(parsed.error.issues), formError: null, values };
  }

  try {
    await db.user.update({ where: { id: user.id }, data: parsed.data });
    await writeAudit(user.id, "user", "profile.updated", { fields: Object.keys(parsed.data) });
  } catch (error) {
    console.error("[onboarding] saving profile failed", { userId: user.id, error: error instanceof Error ? error.message : error });
    return { fieldErrors: {}, formError: "We couldn't save your profile. Try again.", values };
  }
  redirect("/jobs");
}
