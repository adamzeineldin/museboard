import type { Metadata } from "next";
import { LinkActionForm } from "@/app/digest/_components/LinkActionForm";
import { LINK_PAGE_METADATA, LinkCard, tokenParam } from "@/app/digest/_components/LinkCard";
import { inspectUnsubscribeLink } from "@/lib/digest";
import { unsubscribeAction } from "./actions";

// GET /digest/unsubscribe?token=... Read-only; the opt-out happens on the button's POST.

export const metadata: Metadata = { title: "Stop the weekly digest", ...LINK_PAGE_METADATA };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function UnsubscribePage({ searchParams }: { searchParams: SearchParams }) {
  const token = tokenParam(await searchParams);
  const outcome = await inspectUnsubscribeLink(token);
  return (
    <LinkCard title="Stop the weekly digest">
      <LinkActionForm
        initial={outcome}
        token={token}
        action={unsubscribeAction}
        confirmLabel="Stop these emails"
        pendingLabel="Saving…"
        appHref="/settings"
      />
    </LinkCard>
  );
}
