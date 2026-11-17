import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { PRODUCT_NAME } from "@/lib/brand";
import { requireUser } from "@/lib/current-user";
import { DEFAULT_TIME_ZONE, isProfileComplete, supportedTimeZones } from "@/lib/profile";
import { OnboardingForm } from "./OnboardingForm";

export const metadata: Metadata = { title: "Welcome" };

// The setup path shown in the rail. Only step 1 happens here; the rest live on Settings and Rules.
const SETUP_STEPS = [
  { title: "About you", hint: "Name, school, time zone" },
  { title: "Upload resume", hint: "Muse tailors from this" },
  { title: "Connect Muse", hint: "Lets Muse apply for you" },
  { title: "Set rules", hint: "Roles, limits and dealbreakers" },
] as const;

// Lives outside the (app) group because the (app) layout redirects incomplete profiles here.
export default async function OnboardingPage() {
  const user = await requireUser();
  if (isProfileComplete(user)) redirect("/jobs");

  const thisYear = new Date().getFullYear();
  const gradYears = Array.from({ length: 8 }, (_, i) => thisYear - 1 + i);

  return (
    <div className="onboard">
      <aside className="onboard-rail" aria-label="Setup steps">
        <div className="brand">
          <b>{PRODUCT_NAME}</b>
        </div>
        <ol className="steps">
          {SETUP_STEPS.map((step, index) => (
            <li key={step.title} aria-current={index === 0 ? "step" : undefined}>
              <span className="num" aria-hidden="true">
                {index + 1}
              </span>
              <div>
                <div className="st">{step.title}</div>
                <div className="sh">{step.hint}</div>
              </div>
            </li>
          ))}
        </ol>
      </aside>
      <div className="onboard-progress" aria-hidden="true">
        {SETUP_STEPS.map((step, index) => (
          <span key={step.title} data-done={index === 0 ? "" : undefined} />
        ))}
      </div>
      <main className="onboard-main">
        <div>
          <div className="eyebrow">Step 1 of {SETUP_STEPS.length}</div>
          <h1>Welcome to {PRODUCT_NAME}</h1>
          <p className="lede">
            {PRODUCT_NAME} finds the jobs. Muse prepares and submits applications inside the rules you approve. First, a few
            details so drafts and weekly limits fit you.
          </p>
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
      </main>
    </div>
  );
}
