import { ButtonLink } from "@/components/ui";
import { campaignCardModel, type CampaignCardInput } from "./campaign-card-model";
import { MUSE_STATUS_LINE, type MuseConnection } from "./muse-connection";

export interface CampaignCardProps {
  campaign: CampaignCardInput | null;
  /** Shown as the card's first line ("Muse connected"). Omitted in tests that only cover the campaign part. */
  connection?: MuseConnection;
}

function MuseStatus({ connection }: { connection: MuseConnection }) {
  const line = MUSE_STATUS_LINE[connection];
  return (
    <div className="muse-status">
      <span className="dot" data-tone={line.tone} aria-hidden="true" />
      {line.label}
    </div>
  );
}

/** Muse + campaign status card pinned to the bottom of the sidebar (hidden on phones). */
export function CampaignCard({ campaign, connection }: CampaignCardProps) {
  const model = campaignCardModel(campaign);
  const status = connection ? <MuseStatus connection={connection} /> : null;
  if (model.kind === "none") {
    return (
      <div className="camp-card">
        {status}
        <b>No campaign approved</b>
        <span>Muse asks before every application until you approve your rules.</span>
        <ButtonLink href="/campaign" variant="primary" size="small">
          Set up rules
        </ButtonLink>
      </div>
    );
  }
  if (model.kind === "ended") {
    return (
      <div className="camp-card">
        {status}
        <b>{model.heading}</b>
        <span>{model.endsLabel}</span>
        <ButtonLink href="/campaign" variant="primary" size="small">
          Set new dates
        </ButtonLink>
      </div>
    );
  }
  return (
    <div className="camp-card">
      {status}
      <b>{model.heading}</b>
      <div className="meter" role="presentation">
        <i style={{ width: `${model.meterPercent}%` }} />
      </div>
      <span>{model.endsLabel}</span>
    </div>
  );
}
