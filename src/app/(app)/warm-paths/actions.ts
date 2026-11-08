"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  SESSION_ENDED,
  type ActionResult,
  type ContactField,
  type ContactFormState,
  type ImportState,
} from "@/components/warm-paths/action-state";
import { getSessionUserId } from "@/lib/current-user";
import {
  OutreachError,
  createContact,
  deleteContact,
  draftOutreach,
  importContactsCsv,
  requireContact,
  setOutreachSent,
  updateContact,
  userMessage,
} from "@/lib/outreach";
import { CSV_MAX_BYTES } from "@/lib/outreach/csv";
import { contactFieldsSchema, draftRequestSchema, importSourceSchema, markSentSchema } from "@/lib/outreach/schemas";

// Server actions for /warm-paths. The user id always comes from the session, never from form input,
// and every lib call below is scoped to that id. Inroad only drafts: nothing here sends a message.

const PATH = "/warm-paths";
const CONTACT_FIELDS: readonly ContactField[] = ["name", "role", "company", "relationship", "email", "notes"];
const contactIdSchema = z.string().trim().min(1).max(200);

function logFailure(action: string, userId: string, error: unknown): void {
  if (error instanceof OutreachError) return;
  console.error(`[warm-paths] ${action} failed`, { userId, error: error instanceof Error ? error.message : error });
}

function readContactForm(formData: FormData): Record<ContactField, string> {
  return Object.fromEntries(CONTACT_FIELDS.map((field) => [field, String(formData.get(field) ?? "")])) as Record<ContactField, string>;
}

function contactFormErrors(input: Record<ContactField, string>): ContactFormState | null {
  const parsed = contactFieldsSchema.safeParse(input);
  if (parsed.success) return null;
  const fieldErrors: ContactFormState["fieldErrors"] = {};
  for (const issue of parsed.error.issues) {
    const key = issue.path[0] as ContactField;
    if (CONTACT_FIELDS.includes(key) && !fieldErrors[key]) fieldErrors[key] = issue.message;
  }
  return { status: "error", fieldErrors, formError: null, message: null, values: input };
}

const formError = (message: string, values: ContactFormState["values"] = {}): ContactFormState => ({
  status: "error",
  fieldErrors: {},
  formError: message,
  message: null,
  values,
});

export async function createContactAction(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const userId = await getSessionUserId();
  if (!userId) return formError(SESSION_ENDED);
  const input = readContactForm(formData);
  const invalid = contactFormErrors(input);
  if (invalid) return invalid;
  try {
    const contact = await createContact(userId, input, "manual");
    revalidatePath(PATH);
    return { status: "ok", fieldErrors: {}, formError: null, message: `Added ${contact.name}`, values: {} };
  } catch (error) {
    logFailure("create contact", userId, error);
    return formError(userMessage(error, "We couldn't add that contact. Try again."), input);
  }
}

export async function updateContactAction(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const userId = await getSessionUserId();
  if (!userId) return formError(SESSION_ENDED);
  const contactId = contactIdSchema.safeParse(formData.get("contactId") ?? "");
  if (!contactId.success) return formError("That contact isn't valid.");
  const input = readContactForm(formData);
  const invalid = contactFormErrors(input);
  if (invalid) return invalid;
  try {
    const contact = await updateContact(userId, contactId.data, input);
    revalidatePath(PATH);
    return { status: "ok", fieldErrors: {}, formError: null, message: `Saved ${contact.name}`, values: input };
  } catch (error) {
    logFailure("update contact", userId, error);
    return formError(userMessage(error, "We couldn't save that contact. Try again."), input);
  }
}

export async function deleteContactAction(contactId: string): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: SESSION_ENDED };
  const parsed = contactIdSchema.safeParse(contactId);
  if (!parsed.success) return { ok: false, error: "That contact isn't valid." };
  try {
    const contact = await requireContact(userId, parsed.data);
    await deleteContact(userId, contact.id);
    revalidatePath(PATH);
    return { ok: true, message: `Deleted ${contact.name}.` };
  } catch (error) {
    logFailure("delete contact", userId, error);
    return { ok: false, error: userMessage(error, "We couldn't delete that contact. Try again.") };
  }
}

const importError = (error: string): ImportState => ({ status: "error", error, report: null });

export async function importContactsAction(_prev: ImportState, formData: FormData): Promise<ImportState> {
  const userId = await getSessionUserId();
  if (!userId) return importError(SESSION_ENDED);
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return importError("Choose a CSV file to import.");
  const source = importSourceSchema.safeParse(formData.get("source"));
  if (!source.success) return importError(source.error.issues[0]?.message ?? "Pick where this list came from");
  if (file.size > CSV_MAX_BYTES) return importError("The file is larger than 1 MB. Split it and import the parts.");
  try {
    const result = await importContactsCsv(userId, await file.text(), source.data, file.name.slice(0, 200));
    if (!result.ok) return importError(result.error);
    revalidatePath(PATH);
    return { status: "ok", error: null, report: { created: result.created, errors: result.errors, duplicates: result.duplicates } };
  } catch (error) {
    logFailure("import contacts", userId, error);
    return importError(userMessage(error, "We couldn't import that file. Nothing was saved from it. Try again."));
  }
}

interface DraftInput {
  contactId: string;
  kind: "coffee_chat" | "referral_ask";
  jobId?: string;
}

export async function saveDraftAction(input: DraftInput): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: SESSION_ENDED };
  const parsed = draftRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That draft request isn't valid." };
  try {
    await draftOutreach(userId, parsed.data.contactId, parsed.data.kind, parsed.data.jobId, "user");
    revalidatePath(PATH);
    return { ok: true, message: "Draft saved" };
  } catch (error) {
    logFailure("save draft", userId, error);
    return { ok: false, error: userMessage(error, "We couldn't save this draft. Try again.") };
  }
}

/** "Mark as sent" on a preview that hasn't been saved yet: save it, then mark it sent by the user. */
export async function markPreviewSentAction(input: DraftInput): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: SESSION_ENDED };
  const parsed = draftRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That draft request isn't valid." };
  try {
    const { outreach } = await draftOutreach(userId, parsed.data.contactId, parsed.data.kind, parsed.data.jobId, "user");
    await setOutreachSent(userId, outreach.id, true);
    revalidatePath(PATH);
    return { ok: true, message: "Marked as sent" };
  } catch (error) {
    logFailure("mark preview sent", userId, error);
    return { ok: false, error: userMessage(error, "We couldn't update this draft. Try again.") };
  }
}

export async function setSentAction(input: { outreachId: string; sent: boolean }): Promise<ActionResult> {
  const userId = await getSessionUserId();
  if (!userId) return { ok: false, error: SESSION_ENDED };
  const parsed = markSentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "That update isn't valid." };
  try {
    await setOutreachSent(userId, parsed.data.outreachId, parsed.data.sent);
    revalidatePath(PATH);
    return { ok: true, message: parsed.data.sent ? "Marked as sent" : "Back to draft" };
  } catch (error) {
    logFailure("toggle sent", userId, error);
    return { ok: false, error: userMessage(error, "We couldn't update this draft. Try again.") };
  }
}
