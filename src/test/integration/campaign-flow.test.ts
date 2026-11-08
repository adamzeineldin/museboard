import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { User } from "@/generated/prisma/client";
import {
  APPLICATION_REASONS,
  approveWaiting,
  evaluateJobForUser,
  getSubmissionPacket,
  prepareApplication,
  recordSubmission,
  runWeeklyPass,
  skipWaiting,
  weekCount,
} from "@/lib/applications";
import { approveVersion, getCampaignState, proposeVersion } from "@/lib/campaign";
import { recomputeMatches } from "@/lib/matching";
import { createContact } from "@/lib/outreach";
import { uploadResume } from "@/lib/resume";
import { RULE_REASONS } from "@/lib/rules";
import { loadJobsFeed } from "@/components/jobs/feed-data";
import { statusChip } from "@/components/jobs/job-view-model";
import { db, resetDb } from "@/test/db";
import { campaignRules, JOB_IDS, newStudent, RESUME_TXT, seedJobs, useTempStorage } from "./world";

// End to end through the real modules (M4 resume + matching, M5 campaign + applications, M6 outreach):
// upload -> recompute -> propose + approve -> edit (pending) -> weekly pass -> packets -> submit.

let restoreStorage: () => void;
beforeAll(() => {
  restoreStorage = useTempStorage();
});
afterAll(() => restoreStorage());

interface Setup {
  user: User;
  resumeId: string;
  approvedVersionId: string;
  bestContactId: string;
}

async function setUpApprovedCampaign(): Promise<Setup> {
  const now = new Date();
  const companies = await seedJobs();
  const user = await newStudent();

  const { resume, becameDefault } = await uploadResume(user.id, { filename: "jordan-lee.txt", bytes: RESUME_TXT });
  expect(becameDefault).toBe(true);
  expect(resume.parsedText).toContain("Raft KV store");
  expect(await recomputeMatches(user.id)).toBe(6);

  const metaId = companies.get("Meta");
  if (!metaId) throw new Error("seed is missing Meta");
  await createContact(user.id, { name: "Priya Shah", role: "Software Engineer", company: "Meta", relationship: "Alum" });
  const best = await createContact(user.id, {
    name: "Alex Kim",
    role: "Engineering Manager",
    company: "Meta",
    relationship: "Met at a coffee chat",
  });

  const proposed = await proposeVersion(user.id, campaignRules(resume.id, now), "web");
  const approved = await approveVersion(user.id, proposed.id, "web");
  return { user, resumeId: resume.id, approvedVersionId: approved.id, bestContactId: best.id };
}

async function feedLabels(user: User): Promise<Map<string, string>> {
  const feed = await loadJobsFeed({ id: user.id, timezone: user.timezone }, { filter: "recommended", limit: 50 });
  return new Map(feed.cards.map((card) => [card.id, card.chip.label]));
}

describe("campaign flow across resume, matching, campaign, applications and outreach", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("scores every open job from the uploaded TXT resume, ranking SWE roles above sales", async () => {
    const { user } = await setUpApprovedCampaign();
    const matches = await db.match.findMany({ where: { userId: user.id } });
    const score = (jobId: string) => matches.find((m) => m.jobId === jobId)?.score ?? -1;
    expect(matches).toHaveLength(6);
    for (const jobId of [JOB_IDS.stripe, JOB_IDS.datadog, JOB_IDS.cloudflare, JOB_IDS.meta]) {
      expect(score(jobId)).toBeGreaterThanOrEqual(70);
    }
    expect(score(JOB_IDS.sales)).toBeLessThan(45);
  });

  it("labels jobs on the Jobs page exactly as evaluateJobForUser decides", async () => {
    const { user } = await setUpApprovedCampaign();
    const labels = await feedLabels(user);
    expect(labels.size).toBe(6);
    for (const [jobId, label] of labels) {
      expect(label).toBe(statusChip(await evaluateJobForUser(user.id, jobId), null).label);
    }
    expect(labels.get(JOB_IDS.stripe)).toBe("Will auto-apply");
    expect(labels.get(JOB_IDS.meta)).toBe(RULE_REASONS.topChoice);
    expect(labels.get(JOB_IDS.rampNewGrad)).toBe(RULE_REASONS.roleNotInCampaign);
    expect(labels.get(JOB_IDS.sales)).toBe(RULE_REASONS.notOnCompanyList);
  });

  it("runs the weekly pass under the approved version even after an unapproved edit", async () => {
    const { user, resumeId, approvedVersionId, bestContactId } = await setUpApprovedCampaign();
    const before = await feedLabels(user);

    // Edit: Meta becomes auto-apply and the cap rises. This is pending and must change nothing.
    const edited = { ...campaignRules(resumeId, new Date()), autoCompanies: ["Stripe", "Datadog", "Cloudflare", "Ramp", "Meta"], askFirstCompanies: [], weeklyCap: 10 };
    const pending = await proposeVersion(user.id, edited, "web");
    const state = await getCampaignState(user.id);
    expect(state.inForce?.id).toBe(approvedVersionId);
    expect(state.pending?.id).toBe(pending.id);
    expect(await feedLabels(user)).toEqual(before);

    const summary = await runWeeklyPass(user.id, "inroad");
    expect(summary.reason).toBeUndefined();
    expect(summary.failed).toBeUndefined();
    // Cap 2: the two best auto matches are prepared, the third auto match waits on the cap.
    expect(summary.submitted).toEqual(["Datadog · Backend Software Engineering Intern 2027", "Stripe · Software Engineer Intern, Summer 2027"]);
    expect(summary.waiting).toEqual(expect.arrayContaining(["Meta · Software Engineer Intern, 2027", "Cloudflare · Software Engineering Intern (Summer 2027)"]));
    expect(summary.waiting).toHaveLength(2);
    expect(summary.referralDrafts).toEqual(["Meta · Software Engineer Intern, 2027"]);

    const apps = await db.application.findMany({ where: { userId: user.id } });
    const byJob = new Map(apps.map((a) => [a.jobId, a]));
    expect(apps).toHaveLength(4); // Ramp new grad (role) and Acme (company) are not campaign candidates.
    expect(byJob.get(JOB_IDS.stripe)).toMatchObject({ status: "prepared", decidedBy: "campaign", campaignVersionId: approvedVersionId });
    expect(byJob.get(JOB_IDS.datadog)).toMatchObject({ status: "prepared", decidedBy: "campaign" });
    expect(byJob.get(JOB_IDS.cloudflare)).toMatchObject({ status: "waiting", reason: RULE_REASONS.weeklyLimit });
    expect(byJob.get(JOB_IDS.meta)).toMatchObject({ status: "waiting", reason: RULE_REASONS.topChoice, campaignVersionId: approvedVersionId });
    expect(await weekCount(user.id, new Date(), user.timezone)).toBe(2);

    // Top choice: one referral_ask draft, for the strongest contact at Meta, never sent by Inroad.
    const outreach = await db.outreach.findMany({ where: { userId: user.id } });
    expect(outreach).toHaveLength(1);
    expect(outreach[0]).toMatchObject({ kind: "referral_ask", contactId: bestContactId, jobId: JOB_IDS.meta, status: "draft" });

    // Ground rule 6: every application has an audit entry with the rule-check result and reason.
    const audits = await db.auditEvent.findMany({ where: { userId: user.id, action: "application.prepared" } });
    for (const app of apps) {
      const entry = audits.find((a) => (a.payload as { applicationId?: string }).applicationId === app.id);
      expect(entry?.payload).toMatchObject({ ok: app.status === "prepared", reason: app.reason, versionId: approvedVersionId });
    }
  });

  it("refuses packets for waiting applications until the user approves, then records the submission", async () => {
    const { user } = await setUpApprovedCampaign();
    await runWeeklyPass(user.id, "inroad");
    const apps = await db.application.findMany({ where: { userId: user.id } });
    const app = (jobId: string) => {
      const found = apps.find((a) => a.jobId === jobId);
      if (!found) throw new Error(`no application for ${jobId}`);
      return found;
    };

    const meta = app(JOB_IDS.meta);
    expect(await getSubmissionPacket(user.id, meta.id)).toEqual({
      allowed: false,
      reason: `Waiting on your approval: ${RULE_REASONS.topChoice}`,
    });

    // A campaign-prepared application is re-checked at release time (not counting itself).
    const stripe = app(JOB_IDS.stripe);
    expect((await getSubmissionPacket(user.id, stripe.id)).allowed).toBe(true);
    const submitted = await recordSubmission(user.id, stripe.id, "user", "Confirmation #A123");
    expect(submitted).toMatchObject({ status: "submitted", confirmationText: "Confirmation #A123" });
    expect(submitted.submittedAt).toBeInstanceOf(Date);
    expect(await getSubmissionPacket(user.id, stripe.id)).toEqual({ allowed: false, reason: "Already submitted." });

    const approved = await approveWaiting(user.id, meta.id);
    expect(approved).toMatchObject({ status: "prepared", decidedBy: "user", reason: "Approved by you" });
    const released = await getSubmissionPacket(user.id, meta.id);
    if (!released.allowed) throw new Error(`expected the packet, got: ${released.reason}`);
    expect(released.applyUrl).toBe(`https://jobs.example.com/${encodeURIComponent(JOB_IDS.meta)}`);
    expect(released.packet.resume?.filename).toBe("jordan-lee.txt");
    expect(released.packet.fitSummary).toHaveLength(3);

    // The user's approval counts toward the cap (docs/ARCHITECTURE.md "weekCount"): with Stripe submitted and
    // Meta approved, the other campaign-prepared application is held at release time.
    expect(await getSubmissionPacket(user.id, app(JOB_IDS.datadog).id)).toEqual({ allowed: false, reason: RULE_REASONS.weeklyLimit });

    const skipped = await skipWaiting(user.id, app(JOB_IDS.cloudflare).id);
    expect(skipped).toMatchObject({ status: "skipped", reason: "Skipped by you" });
    expect(await getSubmissionPacket(user.id, skipped.id)).toEqual({ allowed: false, reason: "You skipped this application." });

    const actions = (await db.auditEvent.findMany({ where: { userId: user.id } })).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(["application.approved", "application.skipped", "application.submitted", "application.packet_requested"]));
  });

  it("applies an edit only after it is approved", async () => {
    const { user, resumeId } = await setUpApprovedCampaign();
    const edited = { ...campaignRules(resumeId, new Date()), autoCompanies: ["Stripe", "Meta"], askFirstCompanies: [] };
    const pending = await proposeVersion(user.id, edited, "web");
    expect(await evaluateJobForUser(user.id, JOB_IDS.meta)).toMatchObject({ ok: false, topChoice: true });

    await approveVersion(user.id, pending.id, "web");
    expect(await evaluateJobForUser(user.id, JOB_IDS.meta)).toEqual({ ok: true, reason: RULE_REASONS.fits });
    expect((await feedLabels(user)).get(JOB_IDS.datadog)).toBe(RULE_REASONS.notOnCompanyList);
  });

  it("holds a user-prepared job outside the campaign with the rule-check reason, and audits it", async () => {
    const { user } = await setUpApprovedCampaign();
    const app = await prepareApplication(user.id, JOB_IDS.sales, "user");
    expect(app).toMatchObject({ status: "waiting", decidedBy: "campaign", reason: RULE_REASONS.notOnCompanyList });
    expect(await getSubmissionPacket(user.id, app.id)).toEqual({
      allowed: false,
      reason: `Waiting on your approval: ${RULE_REASONS.notOnCompanyList}`,
    });
    const audit = await db.auditEvent.findFirst({ where: { userId: user.id, action: "application.prepared" } });
    expect(audit).toMatchObject({ actor: "user" });
    expect(audit?.payload).toMatchObject({ applicationId: app.id, ok: false, reason: RULE_REASONS.notOnCompanyList });
    // Preparing again is idempotent per (user, job).
    expect((await prepareApplication(user.id, JOB_IDS.sales, "user")).id).toBe(app.id);
  });

  it("refuses to prepare without a resume, creates no application, and logs the attempt", async () => {
    await seedJobs();
    const user = await newStudent();
    await expect(prepareApplication(user.id, JOB_IDS.stripe, "muse")).rejects.toMatchObject({
      code: "no_resume",
      message: APPLICATION_REASONS.uploadResume,
    });
    expect(await db.application.count({ where: { userId: user.id } })).toBe(0);
    const audit = await db.auditEvent.findFirst({ where: { userId: user.id, action: "application.blocked" } });
    expect(audit).toMatchObject({ actor: "muse" });
    expect(audit?.payload).toMatchObject({ jobId: JOB_IDS.stripe, ok: false, reason: APPLICATION_REASONS.uploadResume });
  });

  it("does not run the pass, and logs why, without an approved campaign", async () => {
    await seedJobs();
    const user = await newStudent();
    const summary = await runWeeklyPass(user.id, "muse");
    expect(summary).toEqual({ submitted: [], waiting: [], referralDrafts: [], reason: RULE_REASONS.noApprovedVersion });
    const audit = await db.auditEvent.findFirst({ where: { userId: user.id, action: "weekly_pass.ran" } });
    expect(audit?.actor).toBe("muse");
  });
});
