import { Chip, ErrorState, Panel } from "@/components/ui";
import { ContactForm } from "./ContactForm";
import { CopyButton } from "./CopyButton";
import { DeleteContactButton } from "./DeleteContactButton";
import { DraftHistory } from "./DraftHistory";
import { DraftOptions } from "./DraftOptions";
import type { SelectedView } from "./load";
import { PacketView } from "./PacketView";
import { SaveDraftButton } from "./SaveDraftButton";
import { panelLabel } from "./selection";
import { SentToggle } from "./SentToggle";

const DRAFT_TEXT_ID = "draft-text";

export function DraftPanel({ selected, timeZone }: { selected: SelectedView; timeZone: string }) {
  const { contact, kind, jobId, saved } = selected;
  const label = panelLabel(kind, contact.name);

  return (
    <Panel aria-labelledby="draft-heading">
      <div className="head">
        <h2 id="draft-heading" className="label">
          {label}
        </h2>
        {selected.draftText ? <CopyButton targetId={DRAFT_TEXT_ID} label={`Copy draft to ${contact.name}`} /> : null}
      </div>

      <DraftOptions contactId={contact.id} kind={kind} jobId={jobId} jobs={selected.jobs} companyName={contact.company} />

      {selected.draftError ? (
        <ErrorState title="This draft didn't load" message={selected.draftError} />
      ) : selected.draftText ? (
        <>
          <div id={DRAFT_TEXT_ID} className="draft [overflow-wrap:anywhere]" tabIndex={-1}>
            {selected.draftText}
          </div>
          <div className="actions items-center">
            {saved ? (
              <>
                <SentToggle target={{ type: "saved", outreachId: saved.id }} sent={saved.status === "sent_by_user"} contactName={contact.name} />
                <Chip tone={saved.status === "sent_by_user" ? "ok" : "neutral"}>
                  {saved.status === "sent_by_user" ? "Sent by you" : "Saved draft"}
                </Chip>
              </>
            ) : (
              <>
                <SaveDraftButton contactId={contact.id} kind={kind} jobId={jobId} />
                <SentToggle target={{ type: "preview", contactId: contact.id, kind, jobId }} sent={false} contactName={contact.name} />
              </>
            )}
          </div>
        </>
      ) : null}

      {selected.packet ? <PacketView packet={selected.packet} companyName={contact.company} /> : null}

      <p className="muted text-[.82rem]">Inroad drafts this. You send it yourself, from your own account.</p>

      <DraftHistory drafts={selected.history} contactName={contact.name} timeZone={timeZone} />

      <details>
        <summary className="cursor-pointer text-sm font-semibold">Edit or delete {contact.name}</summary>
        <div className="mt-3 flex flex-col gap-4">
          <ContactForm key={contact.id} contact={contact} />
          <DeleteContactButton contactId={contact.id} contactName={contact.name} />
        </div>
      </details>
    </Panel>
  );
}
