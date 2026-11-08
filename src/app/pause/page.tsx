import type { Metadata } from "next";
import { LinkActionForm } from "@/app/digest/_components/LinkActionForm";
import { LINK_PAGE_METADATA, LinkCard, tokenParam } from "@/app/digest/_components/LinkCard";
import { inspectPauseLink } from "@/lib/digest";
import { pauseCampaignAction } from "./actions";

// GET /pause?token=... from the weekly digest. Read-only: it checks the link and shows a button.
// Pausing happens only when the button is pressed (POST), because mail scanners open links.

export const metadata: Metadata = { title: "Pause campaign", ...LINK_PAGE_METADATA };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function PausePage({ searchParams }: { searchParams: SearchParams }) {
  const token = tokenParam(await searchParams);
  const outcome = await inspectPauseLink(token);
  return (
    <LinkCard title="Pause your campaign">
      <LinkActionForm
        initial={outcome}
        token={token}
        action={pauseCampaignAction}
        confirmLabel="Pause campaign"
        pendingLabel="Pausing…"
        appHref="/campaign"
      />
    </LinkCard>
  );
}
