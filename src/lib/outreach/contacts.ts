import "server-only";
import type { Contact, Prisma } from "@/generated/prisma/client";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";
import type { ContactSource } from "@/lib/types";
import { resolveCompanyId } from "./companies";
import { contactKey } from "./csv";
import { OutreachError, contactNotFound } from "./errors";
import { rankContacts } from "./ranking";
import { contactFieldsSchema } from "./schemas";

// Contacts are entered by the user or imported from a CSV they exported themselves. Nothing is scraped.
// Every query is scoped by the session user's id; callers never pass a userId taken from form input.

export type ContactWithCompany = Prisma.ContactGetPayload<{ include: { company: true } }>;

function parseFields(input: unknown) {
  const parsed = contactFieldsSchema.safeParse(input);
  if (!parsed.success) {
    throw new OutreachError("invalid", parsed.error.issues[0]?.message ?? "Check the contact details.");
  }
  return parsed.data;
}

async function assertNotDuplicate(userId: string, name: string, companyId: string, exceptId?: string): Promise<void> {
  const sameCompany = await db.contact.findMany({ where: { userId, companyId }, include: { company: true } });
  const clash = sameCompany.find((c) => c.id !== exceptId && contactKey(c.name, c.company.name) === contactKey(name, c.company.name));
  if (clash) {
    throw new OutreachError("duplicate", `${clash.name} at ${clash.company.name} is already in your contacts.`);
  }
}

export async function getContact(userId: string, contactId: string): Promise<ContactWithCompany | null> {
  if (!userId || !contactId) return null;
  return db.contact.findFirst({ where: { id: contactId, userId }, include: { company: true } });
}

export async function requireContact(userId: string, contactId: string): Promise<ContactWithCompany> {
  const contact = await getContact(userId, contactId);
  if (!contact) throw contactNotFound();
  return contact;
}

/** All of the user's contacts with their company, sorted by company name, strongest relationship first within each. */
export async function listContacts(userId: string): Promise<ContactWithCompany[]> {
  const contacts = await db.contact.findMany({ where: { userId }, include: { company: true } });
  const ranked = rankContacts(contacts);
  const rankIndex = new Map(ranked.map((c, index) => [c.id, index]));
  return [...ranked].sort(
    (a, b) => a.company.name.localeCompare(b.company.name) || (rankIndex.get(a.id) ?? 0) - (rankIndex.get(b.id) ?? 0),
  );
}

export async function createContact(userId: string, input: unknown, source: ContactSource = "manual"): Promise<Contact> {
  const fields = parseFields(input);
  const companyId = await resolveCompanyId(fields.company);
  await assertNotDuplicate(userId, fields.name, companyId);
  const contact = await db.contact.create({
    data: {
      userId,
      companyId,
      name: fields.name,
      role: fields.role,
      relationship: fields.relationship,
      email: fields.email,
      notes: fields.notes,
      source,
    },
  });
  await writeAudit(userId, "user", "contact.created", { contactId: contact.id, companyId, source });
  return contact;
}

export async function updateContact(userId: string, contactId: string, input: unknown): Promise<Contact> {
  const existing = await requireContact(userId, contactId);
  const fields = parseFields(input);
  const companyId = await resolveCompanyId(fields.company);
  await assertNotDuplicate(userId, fields.name, companyId, existing.id);
  const updated = await db.contact.update({
    where: { id: existing.id },
    data: {
      companyId,
      name: fields.name,
      role: fields.role,
      relationship: fields.relationship,
      email: fields.email,
      notes: fields.notes,
    },
  });
  await writeAudit(userId, "user", "contact.updated", { contactId: existing.id, companyId });
  return updated;
}

/** Deletes the contact and (by cascade) its drafts. */
export async function deleteContact(userId: string, contactId: string): Promise<void> {
  const existing = await requireContact(userId, contactId);
  const drafts = await db.outreach.count({ where: { userId, contactId: existing.id } });
  await db.contact.delete({ where: { id: existing.id } });
  await writeAudit(userId, "user", "contact.deleted", { contactId: existing.id, companyId: existing.companyId, draftsRemoved: drafts });
}

/** companyId -> the user's contacts there, strongest relationship first. Used for the warm-path chip and filter. */
export async function contactsByCompany(userId: string): Promise<Map<string, Contact[]>> {
  const contacts = await db.contact.findMany({ where: { userId } });
  const grouped = new Map<string, Contact[]>();
  for (const contact of rankContacts(contacts)) {
    grouped.set(contact.companyId, [...(grouped.get(contact.companyId) ?? []), contact]);
  }
  return grouped;
}

/** The warmest contact the user has at a company, or null. Ranking: see ranking.ts. */
export async function bestContactAt(userId: string, companyId: string): Promise<Contact | null> {
  const contacts = await db.contact.findMany({ where: { userId, companyId } });
  return rankContacts(contacts)[0] ?? null;
}
