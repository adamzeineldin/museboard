import type { Metadata } from "next";
import { Button, Panel } from "@/components/ui";
import { signOut } from "@/lib/auth";
import { requireUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Settings" };

async function signOutAction(): Promise<void> {
  "use server";
  await signOut({ redirectTo: "/signin" });
}

// Placeholder from milestone 1 (profile summary + sign out). Later milestones add resumes,
// connector tokens and digest preferences here.
export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <>
      <div className="head">
        <div>
          <h1>Settings</h1>
          <p className="muted">Your profile and account.</p>
        </div>
      </div>
      <Panel aria-label="Profile">
        <span className="label">Profile</span>
        <p>
          <b>{user.name}</b> · {user.school}, class of {user.gradYear}
        </p>
        <p className="muted">
          {user.email} · {user.timezone.replace(/_/g, " ")}
        </p>
        <form action={signOutAction}>
          <Button type="submit">Sign out</Button>
        </form>
      </Panel>
    </>
  );
}
