import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";

const getDefaultResumeMock = vi.hoisted(() => vi.fn());
const fitSummaryMock = vi.hoisted(() => vi.fn(() => ["Matches the posting on Go.", "Relevant work: Built a Go service.", "Why Stripe: payments."]));
vi.mock("@/lib/outreach/deps", () => ({
  fitSummary: fitSummaryMock,
  getDefaultResume: getDefaultResumeMock,
  resumeDownloadPath: (id: string) => `/api/resumes/${id}`,
}));

const { loadWarmPathsView } = await import("./load");
const { createContact, draftOutreach } = await import("@/lib/outreach");

async function fixture() {
  const user = await createTestUser({ name: "Adam Z", school: "State University" });
  const stripe = await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
  const meta = await db.company.create({ data: { name: "Meta", ats: null } });
  const older = await db.job.create({
    data: { id: "gh:stripe:old", companyId: stripe.id, title: "SWE Intern (old)", location: "Remote", type: "intern", url: "https://x/old", source: "greenhouse", postedAt: new Date("2026-10-01") },
  });
  const newer = await db.job.create({
    data: { id: "gh:stripe:new", companyId: stripe.id, title: "SWE Intern 2027", location: "Remote", type: "intern", url: "https://x/new", source: "greenhouse", postedAt: new Date("2026-11-01") },
  });
  await db.job.create({
    data: { id: "gh:stripe:closed", companyId: stripe.id, title: "Closed role", location: "Remote", type: "intern", url: "https://x/c", source: "greenhouse", closedAt: new Date() },
  });
  const priya = await createContact(user.id, { name: "Priya N.", role: "SWE II", company: "Stripe", relationship: "Alum" });
  const jordan = await createContact(user.id, { name: "Jordan K.", role: "SWE", company: "Stripe", relationship: "Hackathon mentor" });
  const marcus = await createContact(user.id, { name: "Marcus T.", role: "PE", company: "Meta", relationship: "Alum" });
  getDefaultResumeMock.mockResolvedValue({ id: "r1", filename: "Resume.pdf", parsedText: "Go" });
  return { user, stripe, meta, older, newer, priya, jordan, marcus };
}

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe("loadWarmPathsView", () => {
  it("returns an empty view for a user without contacts", async () => {
    const user = await createTestUser();
    expect(await loadWarmPathsView(user.id, { contactId: null, jobId: null, kind: "coffee_chat" })).toEqual({ contacts: [], selected: null, notice: null });
  });

  it("selects the requested contact, defaults to the newest open job and previews without saving", async () => {
    const { user, priya, newer, older } = await fixture();
    const view = await loadWarmPathsView(user.id, { contactId: priya.id, jobId: null, kind: "coffee_chat" });
    expect(view.contacts.map((c) => c.name)).toEqual(["Marcus T.", "Jordan K.", "Priya N."]);
    expect(view.contacts[2]).toMatchObject({ initials: "PN", company: "Stripe", relationship: "Alum" });
    const selected = view.selected!;
    expect(selected.contact.id).toBe(priya.id);
    expect(selected.jobs.map((j) => j.id)).toEqual([newer.id, older.id]);
    expect(selected.jobId).toBe(newer.id);
    expect(selected.draftText).toContain("Hi Priya,");
    expect(selected.draftText).toContain("SWE Intern 2027");
    expect(selected.saved).toBeNull();
    expect(selected.packet?.role?.url).toBe("https://x/new");
    expect(await db.outreach.count()).toBe(0);
  });

  it("shows the newest saved draft for the same contact, job and kind, and lists history newest first", async () => {
    const { user, priya, older } = await fixture();
    const first = await draftOutreach(user.id, priya.id, "referral_ask", older.id);
    await db.outreach.update({ where: { id: first.outreach.id }, data: { draft: "Edited earlier draft", createdAt: new Date("2026-01-01") } });
    const coffee = await draftOutreach(user.id, priya.id, "coffee_chat", older.id);
    const view = await loadWarmPathsView(user.id, { contactId: priya.id, jobId: older.id, kind: "referral_ask" });
    expect(view.selected?.saved?.id).toBe(first.outreach.id);
    expect(view.selected?.draftText).toBe("Edited earlier draft");
    expect(view.selected?.history.map((o) => o.id)).toEqual([coffee.outreach.id, first.outreach.id]);
    expect(view.selected?.history[0]).toMatchObject({ kind: "coffee_chat", jobTitle: "SWE Intern (old)", status: "draft", sentAt: null });
  });

  it("picks the best contact at the job's company when only ?job= is given", async () => {
    const { user, jordan, older } = await fixture();
    const view = await loadWarmPathsView(user.id, { contactId: null, jobId: older.id, kind: "coffee_chat" });
    expect(view.selected?.contact.id).toBe(jordan.id);
    expect(view.selected?.jobId).toBe(older.id);
  });

  it("ignores another user's contact id and says so", async () => {
    const { user } = await fixture();
    const other = await createTestUser();
    const theirs = await createContact(other.id, { name: "Secret", company: "Stripe" });
    const view = await loadWarmPathsView(user.id, { contactId: theirs.id, jobId: null, kind: "coffee_chat" });
    expect(view.selected?.contact.name).not.toBe("Secret");
    expect(view.notice).toMatch(/isn't in your list/);
  });

  it("has no job for a company with no open jobs", async () => {
    const { user, marcus } = await fixture();
    const view = await loadWarmPathsView(user.id, { contactId: marcus.id, jobId: "gh:stripe:new", kind: "referral_ask" });
    expect(view.selected?.jobs).toEqual([]);
    expect(view.selected?.jobId).toBeNull();
    expect(view.selected?.packet?.role).toBeNull();
  });

  it("returns a friendly error when the preview can't be built", async () => {
    const { user, priya } = await fixture();
    getDefaultResumeMock.mockRejectedValue(new Error("disk on fire"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const view = await loadWarmPathsView(user.id, { contactId: priya.id, jobId: null, kind: "coffee_chat" });
    expect(view.selected?.draftError).toBe("We couldn't build this draft right now. Try again in a moment.");
    expect(view.selected?.draftText).toBeNull();
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });
});
