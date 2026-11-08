import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { ResumeList } from "@/components/resume/ResumeList";
import { ResumeUploadForm } from "@/components/resume/ResumeUploadForm";
import { IDLE_RESUME_STATE } from "@/components/resume/action-state";
import { JobCard } from "./JobCard";
import { JobFilters } from "./JobFilters";
import { JobsToastProvider } from "./JobsToast";
import type { JobCardModel } from "./job-view-model";

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

  it("renders an always-present live region for toasts", () => {
    expect(render(null)).toBe('<div role="status" aria-live="polite" aria-atomic="true"></div>');
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
  });
});
