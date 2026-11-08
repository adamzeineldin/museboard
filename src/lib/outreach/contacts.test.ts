import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import {
  bestContactAt,
  contactsByCompany,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  updateContact,
} from "./contacts";
import { OutreachError } from "./errors";

async function company(name: string, ats: string | null = "greenhouse") {
  return db.company.create({ data: { name, ats } });
}

describe("contacts CRUD", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("creates a contact at an existing company (matched case-insensitively) and writes an audit event", async () => {
    const user = await createTestUser();
    const stripe = await company("Stripe");
    const contact = await createContact(user.id, { name: " Priya N. ", role: "SWE II", company: "stripe", relationship: "Alum", email: "", notes: "" });
    expect(contact).toMatchObject({ userId: user.id, name: "Priya N.", role: "SWE II", companyId: stripe.id, source: "manual", email: null, notes: null });
    const events = await db.auditEvent.findMany({ where: { userId: user.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ actor: "user", action: "contact.created", payload: { contactId: contact.id, companyId: stripe.id, source: "manual" } });
  });

  it("creates an unknown company with ats null (never scraped)", async () => {
    const user = await createTestUser();
    const contact = await createContact(user.id, { name: "Sam", company: "Tiny Startup" });
    const created = await db.company.findUniqueOrThrow({ where: { id: contact.companyId } });
    expect(created).toMatchObject({ name: "Tiny Startup", ats: null });
  });

  it("validates input with friendly messages", async () => {
    const user = await createTestUser();
    await expect(createContact(user.id, { name: "", company: "Stripe" })).rejects.toThrow("Name is required");
    await expect(createContact(user.id, { name: "A", company: "Stripe", email: "nope" })).rejects.toThrow("Email doesn't look right");
    await expect(createContact(user.id, { name: "A", company: "Stripe", email: "nope" })).rejects.toBeInstanceOf(OutreachError);
    expect(await db.contact.count()).toBe(0);
  });

  it("refuses a duplicate (name, company) for the same user, case-insensitively", async () => {
    const user = await createTestUser();
    await createContact(user.id, { name: "Priya N.", company: "Stripe" });
    await expect(createContact(user.id, { name: "priya n.", company: "STRIPE" })).rejects.toThrow("Priya N. at Stripe is already in your contacts.");
    const other = await createTestUser();
    await expect(createContact(other.id, { name: "Priya N.", company: "Stripe" })).resolves.toBeTruthy();
  });

  it("updates a contact the user owns and audits it", async () => {
    const user = await createTestUser();
    const contact = await createContact(user.id, { name: "Priya", company: "Stripe" });
    const updated = await updateContact(user.id, contact.id, { name: "Priya N.", role: "Staff Engineer", company: "Ramp", relationship: "Mentor", notes: "Met at a hackathon" });
    expect(updated).toMatchObject({ name: "Priya N.", role: "Staff Engineer", relationship: "Mentor", notes: "Met at a hackathon" });
    const ramp = await db.company.findUniqueOrThrow({ where: { name: "Ramp" } });
    expect(updated.companyId).toBe(ramp.id);
    expect(await db.auditEvent.count({ where: { action: "contact.updated" } })).toBe(1);
  });

  it("allows saving a contact without changing its name and company", async () => {
    const user = await createTestUser();
    const contact = await createContact(user.id, { name: "Priya", company: "Stripe" });
    await expect(updateContact(user.id, contact.id, { name: "Priya", company: "Stripe", notes: "x" })).resolves.toMatchObject({ notes: "x" });
  });

  it("refuses an update that would duplicate another contact", async () => {
    const user = await createTestUser();
    await createContact(user.id, { name: "Priya", company: "Stripe" });
    const other = await createContact(user.id, { name: "Jordan", company: "Stripe" });
    await expect(updateContact(user.id, other.id, { name: "PRIYA", company: "stripe" })).rejects.toThrow("already in your contacts");
  });

  it("cannot read, update or delete another user's contact", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const contact = await createContact(owner.id, { name: "Priya", company: "Stripe" });
    expect(await getContact(intruder.id, contact.id)).toBeNull();
    await expect(updateContact(intruder.id, contact.id, { name: "Hacked", company: "Stripe" })).rejects.toThrow("Contact not found");
    await expect(deleteContact(intruder.id, contact.id)).rejects.toThrow("Contact not found");
    expect(await db.contact.findUniqueOrThrow({ where: { id: contact.id } })).toMatchObject({ name: "Priya" });
  });

  it("deletes a contact (and its drafts) and audits it", async () => {
    const user = await createTestUser();
    const contact = await createContact(user.id, { name: "Priya", company: "Stripe" });
    await db.outreach.create({ data: { userId: user.id, contactId: contact.id, companyId: contact.companyId, kind: "coffee_chat", draft: "Hi" } });
    await deleteContact(user.id, contact.id);
    expect(await db.contact.count()).toBe(0);
    expect(await db.outreach.count()).toBe(0);
    expect(await db.auditEvent.count({ where: { action: "contact.deleted" } })).toBe(1);
  });

  it("lists only the user's contacts with their company, grouped by company name", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await createContact(user.id, { name: "Zed", company: "Stripe" });
    await createContact(user.id, { name: "Amy", company: "Datadog" });
    await createContact(other.id, { name: "Not mine", company: "Stripe" });
    const contacts = await listContacts(user.id);
    expect(contacts.map((c) => [c.company.name, c.name])).toEqual([
      ["Datadog", "Amy"],
      ["Stripe", "Zed"],
    ]);
  });
});

describe("contactsByCompany and bestContactAt", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("groups by company id, ranked strongest first, and scoped to the user", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    const stripe = await company("Stripe");
    const meta = await company("Meta", null);
    const alum = await createContact(user.id, { name: "Alum", company: "Stripe", relationship: "Alum, class of 2023" });
    const mentor = await createContact(user.id, { name: "Mentor", company: "Stripe", relationship: "Hackathon mentor" });
    const marcus = await createContact(user.id, { name: "Marcus", company: "Meta", relationship: "Alum" });
    await createContact(other.id, { name: "Other user's", company: "Stripe", relationship: "Mentor" });

    const byCompany = await contactsByCompany(user.id);
    expect(byCompany.get(stripe.id)?.map((c) => c.id)).toEqual([mentor.id, alum.id]);
    expect(byCompany.get(meta.id)?.map((c) => c.id)).toEqual([marcus.id]);
    expect(byCompany.size).toBe(2);

    expect((await bestContactAt(user.id, stripe.id))?.id).toBe(mentor.id);
    expect(await bestContactAt(other.id, meta.id)).toBeNull();
  });

  it("returns an empty map and null for a user with no contacts", async () => {
    const user = await createTestUser();
    const stripe = await company("Stripe");
    expect((await contactsByCompany(user.id)).size).toBe(0);
    expect(await bestContactAt(user.id, stripe.id)).toBeNull();
  });
});
