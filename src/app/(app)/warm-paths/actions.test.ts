import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";

const session = vi.hoisted(() => ({ userId: null as string | null }));
vi.mock("@/lib/current-user", () => ({ getSessionUserId: async () => session.userId }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/outreach/deps", () => ({
  fitSummary: () => ["Matches the posting on Go.", "Relevant work: Go.", "Why Stripe: payments."],
  getDefaultResume: async () => null,
  resumeDownloadPath: (id: string) => `/api/resumes/${id}`,
}));

const actions = await import("./actions");
const { INITIAL_CONTACT_FORM, INITIAL_IMPORT } = await import("@/components/warm-paths/action-state");
const { createContact } = await import("@/lib/outreach");

function form(fields: Record<string, string | File>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

const csvFile = (text: string, name = "contacts.csv") => new File([text], name, { type: "text/csv" });

beforeEach(async () => {
  await resetDb();
  session.userId = null;
});

describe("auth", () => {
  it("every action refuses without a session", async () => {
    expect(await actions.createContactAction(INITIAL_CONTACT_FORM, form({ name: "A", company: "B" }))).toMatchObject({
      status: "error",
      formError: "Your session ended. Sign in again.",
    });
    expect(await actions.deleteContactAction("x")).toEqual({ ok: false, error: "Your session ended. Sign in again." });
    expect(await actions.setSentAction({ outreachId: "x", sent: true })).toMatchObject({ ok: false });
    expect(await actions.saveDraftAction({ contactId: "x", kind: "coffee_chat" })).toMatchObject({ ok: false });
    expect(await actions.importContactsAction(INITIAL_IMPORT, form({ source: "csv", file: csvFile("name,company\nA,B") }))).toMatchObject({
      status: "error",
    });
    expect(await db.contact.count()).toBe(0);
  });
});

describe("createContactAction / updateContactAction", () => {
  it("creates a contact for the session user, ignoring any userId in the form", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    session.userId = user.id;
    const state = await actions.createContactAction(
      INITIAL_CONTACT_FORM,
      form({ name: "Priya N.", role: "SWE", company: "Stripe", relationship: "Alum", email: "", notes: "", userId: other.id }),
    );
    expect(state).toMatchObject({ status: "ok", message: "Added Priya N." });
    expect(await db.contact.findFirstOrThrow()).toMatchObject({ userId: user.id, source: "manual" });
  });

  it("returns field errors", async () => {
    const user = await createTestUser();
    session.userId = user.id;
    const state = await actions.createContactAction(INITIAL_CONTACT_FORM, form({ name: "", company: "", email: "bad" }));
    expect(state.status).toBe("error");
    expect(state.fieldErrors).toEqual({ name: "Name is required", company: "Company is required", email: "Email doesn't look right" });
  });

  it("reports a duplicate as a form error", async () => {
    const user = await createTestUser();
    session.userId = user.id;
    await createContact(user.id, { name: "Priya", company: "Stripe" });
    const state = await actions.createContactAction(INITIAL_CONTACT_FORM, form({ name: "priya", company: "stripe" }));
    expect(state).toMatchObject({ status: "error", formError: "Priya at Stripe is already in your contacts." });
  });

  it("updates only the session user's contact", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const contact = await createContact(owner.id, { name: "Priya", company: "Stripe" });
    session.userId = intruder.id;
    const denied = await actions.updateContactAction(INITIAL_CONTACT_FORM, form({ contactId: contact.id, name: "X", company: "Stripe" }));
    expect(denied).toMatchObject({ status: "error", formError: "Contact not found." });
    session.userId = owner.id;
    const ok = await actions.updateContactAction(INITIAL_CONTACT_FORM, form({ contactId: contact.id, name: "Priya N.", company: "Stripe" }));
    expect(ok).toMatchObject({ status: "ok", message: "Saved Priya N." });
  });
});

describe("deleteContactAction", () => {
  it("deletes the user's own contact and refuses someone else's", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const contact = await createContact(owner.id, { name: "Priya", company: "Stripe" });
    session.userId = intruder.id;
    expect(await actions.deleteContactAction(contact.id)).toEqual({ ok: false, error: "Contact not found." });
    session.userId = owner.id;
    expect(await actions.deleteContactAction(contact.id)).toEqual({ ok: true, message: "Deleted Priya." });
    expect(await db.contact.count()).toBe(0);
  });

  it("validates the id", async () => {
    session.userId = (await createTestUser()).id;
    expect(await actions.deleteContactAction("")).toEqual({ ok: false, error: "That contact isn't valid." });
  });
});

describe("importContactsAction", () => {
  it("imports for the session user and returns the per-row report", async () => {
    const user = await createTestUser();
    session.userId = user.id;
    const state = await actions.importContactsAction(
      INITIAL_IMPORT,
      form({ source: "alumni-list", file: csvFile("name,company\nPriya,Stripe\n,Ramp\n") }),
    );
    expect(state).toEqual({
      status: "ok",
      error: null,
      report: { created: 1, errors: [{ row: 3, message: "Name is required" }], duplicates: [] },
    });
    expect(await db.contact.findFirstOrThrow()).toMatchObject({ userId: user.id, source: "alumni-list", relationship: "Alum" });
  });

  it("requires a file and a valid source, and enforces the size limit before reading", async () => {
    session.userId = (await createTestUser()).id;
    expect(await actions.importContactsAction(INITIAL_IMPORT, form({ source: "csv" }))).toMatchObject({ status: "error", error: "Choose a CSV file to import." });
    expect(await actions.importContactsAction(INITIAL_IMPORT, form({ source: "linkedin", file: csvFile("name,company\nA,B") }))).toMatchObject({
      status: "error",
      error: "Pick where this list came from",
    });
    const big = new File(["x".repeat(1024 * 1024 + 1)], "big.csv");
    expect(await actions.importContactsAction(INITIAL_IMPORT, form({ source: "csv", file: big }))).toMatchObject({
      status: "error",
      error: "The file is larger than 1 MB. Split it and import the parts.",
    });
  });

  it("passes through file-level CSV errors", async () => {
    session.userId = (await createTestUser()).id;
    const state = await actions.importContactsAction(INITIAL_IMPORT, form({ source: "csv", file: csvFile("a,b\n1,2") }));
    expect(state).toMatchObject({ status: "error", error: "The CSV needs a name column and a company column (found: a, b)." });
  });
});

describe("drafts", () => {
  it("saves a draft, toggles it sent and back, only for the owner", async () => {
    const owner = await createTestUser();
    const intruder = await createTestUser();
    const contact = await createContact(owner.id, { name: "Priya", company: "Stripe" });

    session.userId = intruder.id;
    expect(await actions.saveDraftAction({ contactId: contact.id, kind: "coffee_chat" })).toEqual({ ok: false, error: "Contact not found." });

    session.userId = owner.id;
    const saved = await actions.saveDraftAction({ contactId: contact.id, kind: "coffee_chat" });
    expect(saved).toEqual({ ok: true, message: "Draft saved" });
    const outreach = await db.outreach.findFirstOrThrow();

    session.userId = intruder.id;
    expect(await actions.setSentAction({ outreachId: outreach.id, sent: true })).toEqual({ ok: false, error: "Draft not found." });

    session.userId = owner.id;
    expect(await actions.setSentAction({ outreachId: outreach.id, sent: true })).toEqual({ ok: true, message: "Marked as sent" });
    expect(await db.outreach.findUniqueOrThrow({ where: { id: outreach.id } })).toMatchObject({ status: "sent_by_user" });
    expect(await actions.setSentAction({ outreachId: outreach.id, sent: false })).toEqual({ ok: true, message: "Back to draft" });
    expect(await db.outreach.findUniqueOrThrow({ where: { id: outreach.id } })).toMatchObject({ status: "draft", sentAt: null });
  });

  it("marking an unsaved preview as sent saves it first", async () => {
    const user = await createTestUser();
    const contact = await createContact(user.id, { name: "Priya", company: "Stripe" });
    session.userId = user.id;
    expect(await actions.markPreviewSentAction({ contactId: contact.id, kind: "referral_ask" })).toEqual({ ok: true, message: "Marked as sent" });
    expect(await db.outreach.findFirstOrThrow()).toMatchObject({ kind: "referral_ask", status: "sent_by_user" });
  });

  it("rejects malformed input", async () => {
    session.userId = (await createTestUser()).id;
    // @ts-expect-error runtime validation
    expect(await actions.saveDraftAction({ contactId: "c", kind: "spam" })).toEqual({ ok: false, error: "That draft request isn't valid." });
    // @ts-expect-error runtime validation
    expect(await actions.setSentAction({ outreachId: "o", sent: "yes" })).toEqual({ ok: false, error: "That update isn't valid." });
  });
});
