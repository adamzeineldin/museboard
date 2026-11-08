import Link from "next/link";
import type { CampaignCardInput } from "./campaign-card-model";
import { BrandMark } from "./BrandMark";
import { CampaignCard } from "./CampaignCard";
import { NavLinks } from "./NavLinks";
import { SettingsLink } from "./SettingsLink";

export interface NavRailProps {
  waitingCount: number;
  campaign: CampaignCardInput | null;
}

/** Left rail on desktop; becomes a sticky top bar under 760px. */
export function NavRail({ waitingCount, campaign }: NavRailProps) {
  return (
    <aside className="rail">
      <Link href="/jobs" className="brand" aria-label="Inroad home">
        <BrandMark />
        <b>Inroad</b>
      </Link>
      <NavLinks waitingCount={waitingCount} />
      <CampaignCard campaign={campaign} />
      <div className="rail-foot">
        <SettingsLink />
      </div>
    </aside>
  );
}
