import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { BrandMark } from "@/components/shell/BrandMark";
import { requireUser } from "@/lib/current-user";
import { isProfileComplete } from "@/lib/profile";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Welcome" };

const DEFAULT_TIME_ZONE = "UTC";

function supportedTimeZones(current: string): string[] {
  const zones = Intl.supportedValuesOf("timeZone");
  const withUtc = zones.includes(DEFAULT_TIME_ZONE) ? zones : [DEFAULT_TIME_ZONE, ...zones];
  return withUtc.includes(current) ? withUtc : [current, ...withUtc];
}

// Lives outside the (app) group because the (app) layout redirects incomplete profiles here.
export default async function OnboardingPage() {
  const user = await requireUser();
  if (isProfileComplete(user)) redirect("/jobs");

  const thisYear = new Date().getFullYear();
  const gradYears = Array.from({ length: 8 }, (_, i) => thisYear - 1 + i);

  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          <b>Inroad</b>
        </div>
        <div>
          <h1>Welcome to Inroad</h1>
          <p className="muted">A few details so drafts and weekly limits fit you.</p>
        </div>
        <OnboardingForm
          defaults={{
            name: user.name ?? "",
            school: user.school ?? "",
            gradYear: user.gradYear ? String(user.gradYear) : "",
            timezone: user.timezone,
          }}
          useBrowserTimeZone={user.timezone === DEFAULT_TIME_ZONE}
          timeZones={supportedTimeZones(user.timezone)}
          gradYears={gradYears}
        />
      </div>
    </main>
  );
}
