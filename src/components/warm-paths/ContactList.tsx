import type { OutreachKind } from "@/lib/types";
import { DraftAskLink } from "./DraftAskLink";
import type { ContactView } from "./load";
import { warmPathsHref } from "./selection";

export interface ContactListProps {
  contacts: ContactView[];
  selectedId: string | null;
  kind: OutreachKind;
}

export function ContactList({ contacts, selectedId, kind }: ContactListProps) {
  return (
    <ul className="list" aria-label="Your contacts">
      {contacts.map((contact) => {
        const selected = contact.id === selectedId;
        return (
          <li key={contact.id} className="row">
            <div className="logo person" aria-hidden="true">
              {contact.initials}
            </div>
            <div className="min-w-0">
              <div className="t">
                {contact.name}{" "}
                <span className="muted font-medium">
                  · {contact.role ? `${contact.role}, ` : ""}
                  {contact.company}
                </span>
              </div>
              <div className="meta">
                {contact.relationship ? <span>{contact.relationship}</span> : null}
                {contact.notes ? <span>{contact.notes}</span> : null}
                {!contact.relationship && !contact.notes ? <span>No notes yet</span> : null}
              </div>
            </div>
            <div className="side">
              <DraftAskLink
                href={warmPathsHref({ contactId: contact.id, jobId: null, kind })}
                contactId={contact.id}
                contactName={contact.name}
                selected={selected}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
