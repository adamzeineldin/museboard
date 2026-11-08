import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";

const fitSummaryMock = vi.hoisted(() =>
  vi.fn((_resumeText: string, job: { title: string; companyName: string }) => [
    "Matches the posting on Go and Postgres.",
    "You shipped two production services.",
    `You've used ${job.companyName}'s public API.`,
  ]),
);
const getDefaultResumeMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/outreach/deps", () => ({
  fitSummary: fitSummaryMock,
  getDefaultResume: getDefaultResumeMock,
  resumeDownloadPath: (id: string) => `/api/resumes/${id}`,
}));

const { createReferralAskDraft, draftOutreach, listOutreachForContact, previewOutreach, setOutreachSent } = await import("./drafts");
const { buildReferralPacket } = await import("./packet");
const { createContact } = await import("./contacts");
const { containsRewardLanguage, wordCount, MAX_DRAFT_WORDS } = await import("./templates");

async function fixture() {
  const user = await createTestUser({ name: "Adam Zeineldin", school: "State University" });
  const stripe = await db.company.create({ data: { name: "Stripe", ats: "greenhouse" } });
  const ramp = await db.company.create({ data: { name: "Ramp", ats: "ashby" } });
  const job = await db.job.create({
    data: {
      id: "greenhouse:stripe:1",
      companyId: stripe.id,
      title: "Software Engineer Intern, Summer 2027",
      location: "Remote",
      type: "intern",
      url: "https://boards.greenhouse.io/stripe/jobs/1",
      source: "greenhouse",
      description: "Build payments APIs",
    },
  });
  const rampJob = await db.job.create({
    data: { id: "ashby:ramp:1", companyId: ramp.id, title: "SWE New Grad", location: "NYC", type: "newgrad", url: "https://jobs.ashbyhq.com/ramp/1", source: "ashby" },
  });
  const contact = await createContact(user.id, {
    name: "Priya Natarajan",
    role: "Software Engineer II",
    company: "Stripe",
    relationship: "Alum, class of 2023",
  });
  const resume = await db.resume.create({
    data: { userId: user.id, filename: "Resume_v3.pdf", storageKey: "k", parsedText: "Go Postgres", isDefault: true },
  });
  getDefaultResumeMock.mockResolvedValue(resume);
  return { user, stripe, ramp, job, rampJob, contact, resume };
}

beforeEach(async () => {
  await resetDb();
  vi.clearAllMocks();
});

describe("buildReferralPacket", () => {
  it("returns the role, a three-line fit summary and the default resume", async () => {
    const { user, job, contact, resume } = await fixture();
    const packet = await buildReferralPacket(user.id, job.id, contact.id);
    expect(packet).toEqual({
      role: { jobId: job.id, title: job.title, company: "Stripe", url: job.url },
      fitSummary: [
        "Matches the posting on Go and Postgres.",
        "You shipped two production services.",
        "You've used Stripe's public API.",
      ],
      resume: { id: resume.id, filename: "Resume_v3.pdf", downloadPath: `/api/resumes/${resume.id}` },
    });
    expect(fitSummaryMock).toHaveBeenCalledWith("Go Postgres", { title: job.title, description: "Build payments APIs", companyName: "Stripe" });
  });

  it("has a null role without a job and a null resume without a default resume", async () => {
    const { user, contact } = await fixture();
    getDefaultResumeMock.mockResolvedValue(null);
    const packet = await buildReferralPacket(user.id, null, contact.id);
    expect(packet.role).toBeNull();
    expect(packet.resume).toBeNull();
    expect(packet.fitSummary).toHaveLength(3);
    expect(fitSummaryMock).toHaveBeenCalledWith("", expect.objectContaining({ companyName: "Stripe" }));
  });

  it("refuses another user's contact and a job at a different company", async () => {
    const { user, contact, rampJob } = await fixture();
    const intruder = await createTestUser();
    await expect(buildReferralPacket(intruder.id, null, contact.id)).rejects.toThrow("Contact not found");
    await expect(buildReferralPacket(user.id, rampJob.id, contact.id)).rejects.toThrow("That job isn't at Stripe.");
    await expect(buildReferralPacket(user.id, "missing", contact.id)).rejects.toThrow("Job not found");
  });
});

describe("draftOutreach", () => {
  it("creates a draft Outreach row, returns the text and packet, and audits it", async () => {
    const { user, job, contact, stripe } = await fixture();
    const result = await draftOutreach(user.id, contact.id, "referral_ask", job.id);

    expect(result.outreach).toMatchObject({
      userId: user.id,
      contactId: contact.id,
      jobId: job.id,
      companyId: stripe.id,
      kind: "referral_ask",
      status: "draft",
      sentAt: null,
      draft: result.draft,
    });
    expect(result.packet.role?.jobId).toBe(job.id);
    expect(result.draft.startsWith("Hi Priya,")).toBe(true);
    expect(result.draft).toContain("Software Engineer Intern, Summer 2027");
    expect(result.draft).toContain("fellow State University alum");
    expect(result.draft).toContain("I've worked with Go and Postgres, which the posting asks for.");
    expect(result.draft).toContain("Either way, thanks for reading.");
    expect(wordCount(result.draft)).toBeLessThan(MAX_DRAFT_WORDS);
    expect(containsRewardLanguage(result.draft)).toBe(false);

    const audit = await db.auditEvent.findFirstOrThrow({ where: { action: "outreach.drafted" } });
    expect(audit).toMatchObject({ actor: "user", payload: { outreachId: result.outreach.id, contactId: contact.id, jobId: job.id, kind: "referral_ask" } });
  });

  it("records the actor that asked for the draft", async () => {
    const { user, contact } = await fixture();
    await draftOutreach(user.id, contact.id, "coffee_chat", undefined, "muse");
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: "outreach.drafted" } })).toMatchObject({ actor: "muse" });
  });

  it("leaves out the fit line when there is no resume", async () => {
    const { user, contact } = await fixture();
    getDefaultResumeMock.mockResolvedValue(null);
    const { draft } = await draftOutreach(user.id, contact.id, "coffee_chat");
    expect(draft).not.toContain("Go and Postgres");
  });

  it("cannot draft for another user's contact", async () => {
    const { contact, job } = await fixture();
    const intruder = await createTestUser();
    await expect(draftOutreach(intruder.id, contact.id, "coffee_chat", job.id)).rejects.toThrow("Contact not found");
    expect(await db.outreach.count()).toBe(0);
  });

  it("validates the kind and ids", async () => {
    const { user, contact } = await fixture();
    // @ts-expect-error kind is validated at runtime
    await expect(draftOutreach(user.id, contact.id, "cold_email")).rejects.toThrow("That draft request isn't valid.");
    await expect(draftOutreach(user.id, "", "coffee_chat")).rejects.toThrow("That draft request isn't valid.");
  });
});

describe("previewOutreach", () => {
  it("builds the same text as a saved draft without writing anything", async () => {
    const { user, contact, job } = await fixture();
    const preview = await previewOutreach(user.id, contact.id, "coffee_chat", job.id);
    expect(await db.outreach.count()).toBe(0);
    expect(await db.auditEvent.count({ where: { action: "outreach.drafted" } })).toBe(0);
    const saved = await draftOutreach(user.id, contact.id, "coffee_chat", job.id);
    expect(saved.draft).toBe(preview.draft);
  });
});

describe("createReferralAskDraft", () => {
  it("creates a referral_ask draft attributed to inroad", async () => {
    const { user, contact, job } = await fixture();
    const outreach = await createReferralAskDraft(user.id, contact.id, job.id);
    expect(outreach).toMatchObject({ kind: "referral_ask", status: "draft", jobId: job.id });
    expect(await db.auditEvent.findFirstOrThrow({ where: { action: "outreach.drafted" } })).toMatchObject({ actor: "inroad" });
  });

  it("returns the existing referral ask for the same contact and job instead of duplicating it", async () => {
    const { user, contact, job } = await fixture();
    const first = await createReferralAskDraft(user.id, contact.id, job.id);
    const second = await createReferralAskDraft(user.id, contact.id, job.id);
    expect(second.id).toBe(first.id);
    expect(await db.outreach.count()).toBe(1);
    const noJob = await createReferralAskDraft(user.id, contact.id);
    expect(noJob.id).not.toBe(first.id);
  });

  it("cannot draft for another user's contact", async () => {
    const { contact } = await fixture();
    const intruder = await createTestUser();
    await expect(createReferralAskDraft(intruder.id, contact.id)).rejects.toThrow("Contact not found");
  });
});

describe("setOutreachSent", () => {
  it("marks a draft as sent by the user and back to draft, auditing both", async () => {
    const { user, contact } = await fixture();
    const { outreach } = await draftOutreach(user.id, contact.id, "coffee_chat");
    const now = new Date("2026-11-07T15:00:00Z");

    const sent = await setOutreachSent(user.id, outreach.id, true, now);
    expect(sent).toMatchObject({ status: "sent_by_user", sentAt: now });

    const back = await setOutreachSent(user.id, outreach.id, false);
    expect(back).toMatchObject({ status: "draft", sentAt: null });

    const actions = (await db.auditEvent.findMany({ where: { userId: user.id }, orderBy: { createdAt: "asc" } })).map((e) => e.action);
    expect(actions).toEqual(["contact.created", "outreach.drafted", "outreach.marked_sent", "outreach.marked_draft"]);
  });

  it("cannot toggle another user's draft", async () => {
    const { user, contact } = await fixture();
    const { outreach } = await draftOutreach(user.id, contact.id, "coffee_chat");
    const intruder = await createTestUser();
    await expect(setOutreachSent(intruder.id, outreach.id, true)).rejects.toThrow("Draft not found");
    expect(await db.outreach.findUniqueOrThrow({ where: { id: outreach.id } })).toMatchObject({ status: "draft" });
  });
});

describe("listOutreachForContact", () => {
  it("lists the contact's drafts newest first with job titles, scoped to the user", async () => {
    const { user, contact, job } = await fixture();
    const first = await draftOutreach(user.id, contact.id, "coffee_chat");
    const second = await draftOutreach(user.id, contact.id, "referral_ask", job.id);
    await db.outreach.update({ where: { id: first.outreach.id }, data: { createdAt: new Date("2026-01-01T00:00:00Z") } });
    const list = await listOutreachForContact(user.id, contact.id);
    expect(list.map((o) => o.id)).toEqual([second.outreach.id, first.outreach.id]);
    expect(list[0].job?.title).toBe(job.title);
    const intruder = await createTestUser();
    expect(await listOutreachForContact(intruder.id, contact.id)).toEqual([]);
  });
});
