import type { Metadata } from "next";
import { ActivityView } from "@/components/activity/ActivityView";
import { toRowModels } from "@/components/activity/rows";
import { getActivity } from "@/lib/applications";
import { requireUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Activity" };

export default async function ActivityPage() {
  const user = await requireUser();
  const data = await getActivity(user.id, user.timezone);
  return (
    <>
      <div className="head">
        <div>
          <h1>Activity</h1>
          <p className="muted">Every application Inroad prepared, and why it went out or came back to you.</p>
        </div>
      </div>
      <ActivityView rows={toRowModels(data.items, user.timezone)} stats={data.stats} campaignActive={data.campaignActive} hiddenHistory={data.hiddenHistory} />
    </>
  );
}
