import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { MusePanel } from "@/components/shell/MusePanel";
import { NavRail } from "@/components/shell/NavRail";
import { getShellData } from "@/components/shell/shell-data";
import { requireUser } from "@/lib/current-user";
import { isProfileComplete } from "@/lib/profile";

// Signed-in shell: nav rail | page | Muse activity. Verifies the session against the database
// (the proxy only checks for a cookie) and sends new users to onboarding.
export default async function AppLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await requireUser();
  if (!isProfileComplete(user)) redirect("/onboarding");
  const shell = await getShellData(user.id, user.timezone);

  return (
    <div className="app">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-30 btn">
        Skip to content
      </a>
      <NavRail waitingCount={shell.waitingCount} campaign={shell.campaign} />
      <main id="main" className="main">
        {children}
      </main>
      <MusePanel events={shell.museEvents} connection={shell.museConnection} />
    </div>
  );
}
