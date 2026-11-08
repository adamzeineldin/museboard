import { Panel } from "@/components/ui";
import { ContactForm } from "./ContactForm";
import { ImportForm } from "./ImportForm";

/** Manual entry and CSV import: the only two ways contacts get into Inroad. Nothing is scraped. */
export function AddContacts({ open }: { open: boolean }) {
  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <Panel aria-labelledby="add-contact-heading">
        <details open={open}>
          <summary className="cursor-pointer">
            <h2 id="add-contact-heading" className="inline text-base">
              Add a contact
            </h2>
          </summary>
          <div className="mt-4">
            <ContactForm />
          </div>
        </details>
      </Panel>
      <Panel aria-labelledby="import-heading">
        <details open={open}>
          <summary className="cursor-pointer">
            <h2 id="import-heading" className="inline text-base">
              Import a CSV
            </h2>
          </summary>
          <div className="mt-4 flex flex-col gap-3">
            <p className="text-sm text-muted">
              Use a file you exported yourself, like your school&apos;s alumni list or your own contacts. Inroad doesn&apos;t scrape
              LinkedIn or any other site.
            </p>
            <ImportForm />
          </div>
        </details>
      </Panel>
    </div>
  );
}
