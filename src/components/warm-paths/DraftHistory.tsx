import { Chip } from "@/components/ui";
import { CopyButton } from "./CopyButton";
import { formatDay } from "./format";
import type { OutreachView } from "./load";
import { KIND_LABELS } from "./selection";
import { SentToggle } from "./SentToggle";

export interface DraftHistoryProps {
  drafts: OutreachView[];
  contactName: string;
  timeZone: string;
}

/** Saved drafts for the selected contact, newest first. */
export function DraftHistory({ drafts, contactName, timeZone }: DraftHistoryProps) {
  return (
    <section aria-labelledby="history-heading" className="flex flex-col gap-2">
      <h3 id="history-heading" className="label">
        Saved drafts to {contactName}
      </h3>
      {drafts.length === 0 ? (
        <p className="text-sm text-muted">No saved drafts yet. Save the draft above, or mark it as sent once you&apos;ve sent it.</p>
      ) : (
        <ul className="flex list-none flex-col gap-2 p-0 m-0">
          {drafts.map((draft) => {
            const textId = `saved-draft-${draft.id}`;
            return (
              <li key={draft.id} className="rounded-xl border border-line p-3 flex flex-col gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-sm">{KIND_LABELS[draft.kind]}</b>
                  <span className="text-sm text-muted">{draft.jobTitle ?? "No specific role"}</span>
                  <span className="text-sm text-muted">
                    · <time dateTime={draft.createdAt}>{formatDay(draft.createdAt, timeZone)}</time>
                  </span>
                  {draft.status === "sent_by_user" ? (
                    <Chip tone="ok">Sent by you{draft.sentAt ? ` ${formatDay(draft.sentAt, timeZone)}` : ""}</Chip>
                  ) : (
                    <Chip tone="neutral">Draft</Chip>
                  )}
                </div>
                <details>
                  <summary className="cursor-pointer text-sm">Show text</summary>
                  <div id={textId} className="draft mt-2 [overflow-wrap:anywhere]" tabIndex={-1}>
                    {draft.draft}
                  </div>
                </details>
                <div className="actions">
                  <CopyButton targetId={textId} label={`Copy saved ${KIND_LABELS[draft.kind].toLowerCase()} to ${contactName}`} />
                  <SentToggle target={{ type: "saved", outreachId: draft.id }} sent={draft.status === "sent_by_user"} contactName={contactName} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
