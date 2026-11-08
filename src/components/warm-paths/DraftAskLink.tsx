"use client";

import { ButtonLink } from "@/components/ui";
import { requestDraftFocus } from "./draft-focus";

export interface DraftAskLinkProps {
  href: string;
  contactId: string;
  contactName: string;
  selected: boolean;
}

/** "Draft ask" for one contact. Keeps the scroll position, then the draft panel takes focus (see draft-focus.ts). */
export function DraftAskLink({ href, contactId, contactName, selected }: DraftAskLinkProps) {
  return (
    <ButtonLink
      href={href}
      size="small"
      variant={selected ? "primary" : "default"}
      aria-current={selected ? "true" : undefined}
      aria-label={selected ? `Drafting ask to ${contactName}` : `Draft ask to ${contactName}`}
      scroll={false}
      onClick={() => {
        if (!selected) requestDraftFocus(contactId);
      }}
    >
      {selected ? "Drafting" : "Draft ask"}
    </ButtonLink>
  );
}
