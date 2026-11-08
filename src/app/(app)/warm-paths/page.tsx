import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";
import { AddContacts } from "@/components/warm-paths/AddContacts";
import { ContactList } from "@/components/warm-paths/ContactList";
import { DraftPanel } from "@/components/warm-paths/DraftPanel";
import { loadWarmPathsView } from "@/components/warm-paths/load";
import { parseWarmPathParams, type RawSearchParams } from "@/components/warm-paths/selection";
import { ToastProvider } from "@/components/warm-paths/Toast";
import { requireUser } from "@/lib/current-user";

export const metadata: Metadata = { title: "Warm paths" };

// Selection lives in the URL (?contact=&job=&kind=) so the Jobs page can link straight to a draft.
// Rendering is read-only: drafts are previewed, and only saved when the user asks.
export default async function WarmPathsPage({ searchParams }: { searchParams: Promise<RawSearchParams> }) {
  const user = await requireUser();
  const params = parseWarmPathParams(await searchParams);
  const view = await loadWarmPathsView(user.id, params);
  const hasContacts = view.contacts.length > 0;

  return (
    <ToastProvider>
      <div className="head">
        <div>
          <h1>Warm paths</h1>
          <p className="muted">People you could ask, from contacts and alumni lists you connected.</p>
        </div>
      </div>

      {view.notice ? (
        <p className="banner" role="status">
          {view.notice}
        </p>
      ) : null}

      {hasContacts ? (
        <ContactList contacts={view.contacts} selectedId={view.selected?.contact.id ?? null} kind={params.kind} />
      ) : (
        <EmptyState title="No contacts yet">
          Contacts come only from people you add here or a CSV you export yourself, like an alumni list. Nothing is scraped:
          Inroad never reads LinkedIn or any social site.
        </EmptyState>
      )}

      {view.selected ? <DraftPanel selected={view.selected} timeZone={user.timezone} /> : null}

      <AddContacts open={!hasContacts} />
    </ToastProvider>
  );
}
