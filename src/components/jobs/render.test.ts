import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ResumeList } from "@/components/resume/ResumeList";
import { ResumeUploadForm } from "@/components/resume/ResumeUploadForm";
import { IDLE_RESUME_STATE } from "@/components/resume/action-state";
import { Button } from "@/components/ui";
import { FeedBanners } from "./FeedBanners";
import { JobCard } from "./JobCard";
import { JobFilters } from "./JobFilters";
import { JobsToastProvider } from "./JobsToast";
import type { JobCardModel } from "./job-view-model";
import { prepareButtonState } from "./prepare-state";

const card: JobCardModel = {
  id: "greenhouse:stripe:1",
  title: "Software Engineer Intern, Summer 2027",
  companyName: "Stripe",
  companyInitials: "S",
  postedLabel: "2 hours ago",
  source: "Greenhouse feed",
  tags: ["New York", "Internship", "$55–60/hr"],
  chip: { tone: "ok", label: "Will auto-apply" },
  warmPath: { contactId: "c1", label: "Priya Shah works here", referralHref: "/warm-paths?contact=c1&job=greenhouse%3Astripe%3A1" },
  score: 91,
  skills: ["Python", "Go"],
  postingUrl: "https://boards.greenhouse.io/stripe/jobs/1",
  applicationStatus: null,
};

const prepare = vi.fn(async () => ({ ok: true as const, status: "prepared", message: "ok" }));
const action = vi.fn(async () => IDLE_RESUME_STATE);
const render = (node: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(createElement(JobsToastProvider, null, node));

describe("JobCard markup", () => {
  it("renders the prototype card with ring, chips, referral link and prepare button", () => {
    const html = render(createElement(JobCard, { card, hasResume: true, prepare }));
    expect(html).toContain('class="job"');
    expect(html).toContain('aria-labelledby="job-greenhouse-stripe-1-title"');
    expect(html).toContain('class="chip ok">Will auto-apply');
    expect(html).toContain('class="chip warm">Priya Shah works here');
    expect(html).toContain('href="/warm-paths?contact=c1&amp;job=greenhouse%3Astripe%3A1"');
    expect(html).toContain('aria-label="91% match, Strong match"');
    expect(html).toContain("Matches your resume on");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toMatch(/>Prepare<span class="sr-only"> Software Engineer Intern/);
  });

  it("shows the upload hint instead of a ring when there is no score, and hides Prepare once applied", () => {
    const html = render(
      createElement(JobCard, { card: { ...card, score: null, warmPath: null, applicationStatus: "submitted" }, hasResume: false, prepare }),
    );
    expect(html).toContain("Upload a resume to see match scores");
    expect(html).not.toContain("Ask for referral");
    expect(html).not.toContain(">Prepare");
  });

  it("hides Prepare when the application is already ready to submit, but keeps it for waiting ones", () => {
    const prepared = render(createElement(JobCard, { card: { ...card, applicationStatus: "prepared" }, hasResume: true, prepare }));
    expect(prepared).not.toContain(">Prepare");
    const waiting = render(createElement(JobCard, { card: { ...card, applicationStatus: "waiting" }, hasResume: true, prepare }));
    expect(waiting).toMatch(/>Prepare<span class="sr-only">/);
  });

  it("hides Prepare on a skipped card (the Skipped chip explains why)", () => {
    const skipped = render(
      createElement(JobCard, { card: { ...card, chip: { tone: "neutral", label: "Skipped" }, applicationStatus: "skipped" }, hasResume: true, prepare }),
    );
    expect(skipped).toContain('class="chip neutral">Skipped');
    expect(skipped).not.toContain(">Prepare");
  });

  it("makes the card heading a programmatic focus target for after Prepare", () => {
    const html = render(createElement(JobCard, { card, hasResume: true, prepare }));
    expect(html).toContain('<h3 id="job-greenhouse-stripe-1-title" tabindex="-1">');
  });

  it("renders prepareButtonState(true) on a Button as aria-disabled and aria-busy with the pending label, never disabled", () => {
    const { label, ...ariaState } = prepareButtonState(true);
    const html = renderToStaticMarkup(createElement(Button, { size: "small", ...ariaState }, label));
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain(">Preparing…</button>");
    expect(html).not.toMatch(/<button[^>]* disabled=""/);
  });

  it("renders an idle Prepare button with no aria-disabled or aria-busy", () => {
    const html = render(createElement(JobCard, { card, hasResume: true, prepare }));
    const button = html.match(/<button[^>]*>Prepare</)?.[0] ?? "";
    expect(button).not.toBe("");
    expect(button).not.toMatch(/ (aria-disabled|aria-busy|disabled)="/);
  });

  it("renders always-present live regions for toasts (status for success, alert for errors)", () => {
    expect(render(null)).toBe('<div role="status" aria-live="polite" aria-atomic="true"></div><div role="alert" aria-atomic="true"></div>');
  });
});

describe("feed banners", () => {
  it("renders nothing when rules and contacts loaded", () => {
    expect(renderToStaticMarkup(createElement(FeedBanners, { rulesAvailable: true, contactsAvailable: true }))).toBe("");
  });

  it("warns when contacts failed to load, so an empty warm filter isn't mistaken for no contacts", () => {
    const html = renderToStaticMarkup(createElement(FeedBanners, { rulesAvailable: true, contactsAvailable: false }));
    expect(html).toContain('role="alert"');
    expect(html).toContain("Inroad couldn&#x27;t load your contacts, so warm paths aren&#x27;t shown. Reload to try again.");
    expect(html).not.toContain("campaign rules");
  });

  it("warns when rules failed to load", () => {
    const html = renderToStaticMarkup(createElement(FeedBanners, { rulesAvailable: false, contactsAvailable: true }));
    expect(html).toContain("campaign rules");
  });
});

describe("filters and resume forms", () => {
  it("exposes the active filter with aria-pressed", () => {
    const html = renderToStaticMarkup(createElement(JobFilters, { active: "warm" }));
    expect(html).toContain('role="group" aria-label="Filter jobs"');
    expect(html).toContain('aria-pressed="true" class="pill">Has a warm path');
    expect(html).toContain('aria-pressed="false" class="pill">Recommended');
  });

  it("labels the upload input and describes the limits", () => {
    const html = renderToStaticMarkup(createElement(ResumeUploadForm, { action }));
    expect(html).toMatch(/<label class="label" for="([^"]+)">Resume file<\/label><input id="\1"/);
    expect(html).toContain("PDF, DOCX or TXT, up to 5 MB");
    expect(html).toContain('accept=".pdf,.docx,.txt');
  });

  it("lists resumes with download links and a default chip", () => {
    const html = renderToStaticMarkup(
      createElement(ResumeList, {
        resumes: [
          { id: "r1", filename: "Resume_v3.pdf", isDefault: true, uploadedLabel: "2 days ago", wordCount: 412, downloadHref: "/api/resumes/r1" },
          { id: "r2", filename: "old.txt", isDefault: false, uploadedLabel: "9 days ago", wordCount: 300, downloadHref: "/api/resumes/r2" },
        ],
        setDefaultAction: action,
        deleteAction: action,
      }),
    );
    expect(html).toContain('href="/api/resumes/r1"');
    expect(html).toContain('class="chip ok">Default');
    expect(html.match(/Make default/g)).toHaveLength(1);
    // Cancel on the inline confirmation hands focus back to the row's Delete button by this id.
    expect(html).toMatch(/<button [^>]*id="resume-delete-r2"[^>]*>Delete<span class="sr-only"> old.txt/);
  });
});
