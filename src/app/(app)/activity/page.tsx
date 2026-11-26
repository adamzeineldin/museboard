import type { Metadata } from "next";
import { ActivityView } from "@/components/activity/ActivityView";
import { toRowModels } from "@/components/activity/rows";
import { pipelineSubtitle } from "@/components/activity/view-model";
import { MusePanel } from "@/components/shell/MusePanel";
import { getMuseActivity } from "@/components/shell/shell-data";
import { getActivity } from "@/lib/applications";
import { requireUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Pipeline" };

export default async function ActivityPage() {
  const user = await requireUser();
  const [data, muse] = await Promise.all([getActivity(user.id, user.timezone), getMuseActivity(user.id)]);
  return (
    <>
      <div className="head">
        <div>
          <h1>Pipeline</h1>
          <p className="muted">{pipelineSubtitle(data.stats)}</p>
        </div>
      </div>
      <ActivityView rows={toRowModels(data.items, user.timezone)} stats={data.stats} campaignActive={data.campaignActive} hiddenHistory={data.hiddenHistory} />
      <MusePanel events={muse.museEvents} connection={muse.museConnection} />
    </>
  );
}
