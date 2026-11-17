import Link from "next/link";
import { PRODUCT_NAME } from "@/lib/brand";
import type { CampaignCardInput } from "./campaign-card-model";
import { CampaignCard } from "./CampaignCard";
import type { MuseConnection } from "./muse-connection";
import { NavLinks } from "./NavLinks";

export interface NavRailProps {
  waitingCount: number;
  campaign: CampaignCardInput | null;
  connection: MuseConnection;
}

/** Left sidebar on desktop (wordmark, nav, Muse status card); a bottom tab bar under 760px. */
export function NavRail({ waitingCount, campaign, connection }: NavRailProps) {
  return (
    <aside className="rail">
      <Link href="/activity" className="brand" aria-label={`${PRODUCT_NAME} home`}>
        <b>{PRODUCT_NAME}</b>
      </Link>
      <NavLinks waitingCount={waitingCount} />
      <CampaignCard campaign={campaign} connection={connection} />
    </aside>
  );
}
