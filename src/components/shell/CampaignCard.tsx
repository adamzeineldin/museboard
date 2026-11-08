import { ButtonLink } from "@/components/ui";
import { campaignCardModel, type CampaignCardInput } from "./campaign-card-model";

export interface CampaignCardProps {
  campaign: CampaignCardInput | null;
}

/** Campaign status card at the bottom of the rail (hidden on phones, like the prototype). */
export function CampaignCard({ campaign }: CampaignCardProps) {
  const model = campaignCardModel(campaign);
  if (model.kind === "none") {
    return (
      <div className="camp-card">
        <span className="label">Campaign</span>
        <b>Not approved</b>
        <span className="muted">Muse asks before every application until you approve one.</span>
        <ButtonLink href="/campaign" variant="primary" size="small">
          Set up
        </ButtonLink>
      </div>
    );
  }
  if (model.kind === "ended") {
    return (
      <div className="camp-card">
        <span className="label">Campaign</span>
        <b>{model.heading}</b>
        <span className="muted">{model.endsLabel}</span>
        <ButtonLink href="/campaign" variant="primary" size="small">
          Set new dates
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="camp-card">
      <span className="label">Campaign</span>
      <b>{model.heading}</b>
      <div className="meter" role="presentation">
        <i style={{ width: `${model.meterPercent}%` }} />
      </div>
      <span className="muted">{model.endsLabel}</span>
    </div>
  );
}
