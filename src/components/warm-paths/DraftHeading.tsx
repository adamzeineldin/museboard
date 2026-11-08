"use client";

import { useEffect, useRef } from "react";
import { takeDraftFocus } from "./draft-focus";

/** The draft panel's heading. Takes focus (scrolling into view) right after the user picks this contact. */
export function DraftHeading({ id, contactId, label }: { id: string; contactId: string; label: string }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (takeDraftFocus(contactId)) ref.current?.focus();
  }, [contactId]);
  return (
    <h2 id={id} ref={ref} className="label" tabIndex={-1}>
      {label}
    </h2>
  );
}
