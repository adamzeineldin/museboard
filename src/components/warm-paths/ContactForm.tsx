"use client";

import { useActionState, useEffect, useId } from "react";
import { createContactAction, updateContactAction } from "@/app/(app)/warm-paths/actions";
import { Button } from "@/components/ui";
import { INITIAL_CONTACT_FORM, type ContactField } from "./action-state";
import { useToast } from "./Toast";

export interface ContactFormProps {
  /** Present when editing an existing contact. */
  contact?: { id: string; name: string; role: string; company: string; relationship: string; email: string | null; notes: string | null };
}

interface FieldSpec {
  name: ContactField;
  label: string;
  hint?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  multiline?: boolean;
}

const FIELDS: readonly FieldSpec[] = [
  { name: "name", label: "Name", required: true, autoComplete: "off" },
  { name: "role", label: "Role", hint: "e.g. Software Engineer, Payments" },
  { name: "company", label: "Company", required: true, autoComplete: "organization" },
  { name: "relationship", label: "How you know them", hint: "e.g. Alum, class of 2023 or Hackathon mentor" },
  { name: "email", label: "Email", type: "email", autoComplete: "off" },
  { name: "notes", label: "Notes", hint: "e.g. Coffee chat Oct 14", multiline: true },
];

export function ContactForm({ contact }: ContactFormProps) {
  const editing = Boolean(contact);
  const [state, action, pending] = useActionState(editing ? updateContactAction : createContactAction, INITIAL_CONTACT_FORM);
  const notify = useToast();
  const formId = useId();

  useEffect(() => {
    if (state.status === "ok" && state.message) notify(state.message);
  }, [state, notify]);

  const valueFor = (field: ContactField): string => state.values[field] ?? (contact ? (contact[field] ?? "") : "");

  return (
    <form action={action} noValidate className="flex flex-col gap-3" aria-describedby={state.formError ? `${formId}-error` : undefined}>
      {contact ? <input type="hidden" name="contactId" value={contact.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map((field) => {
          const id = `${formId}-${field.name}`;
          const error = state.fieldErrors[field.name];
          const describedBy = [field.hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
          const common = {
            id,
            name: field.name,
            defaultValue: valueFor(field.name),
            "aria-invalid": error ? true : undefined,
            "aria-describedby": describedBy,
          } as const;
          return (
            <div key={field.name} className={field.multiline ? "field sm:col-span-2" : "field"}>
              <label htmlFor={id} className="label">
                {field.label}
                {field.required ? <span aria-hidden="true"> *</span> : null}
              </label>
              {field.multiline ? (
                <textarea {...common} rows={2} maxLength={500} />
              ) : (
                <input {...common} type={field.type ?? "text"} required={field.required} autoComplete={field.autoComplete} maxLength={254} />
              )}
              {field.hint ? (
                <span id={`${id}-hint`} className="hint">
                  {field.hint}
                </span>
              ) : null}
              {error ? (
                <span id={`${id}-error`} className="error">
                  {error}
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
      {state.formError ? (
        <p id={`${formId}-error`} className="banner hold" role="alert">
          {state.formError}
        </p>
      ) : null}
      <div>
        <Button type="submit" variant="primary" size="small" disabled={pending}>
          {pending ? "Saving…" : editing ? "Save changes" : "Add contact"}
        </Button>
      </div>
    </form>
  );
}
