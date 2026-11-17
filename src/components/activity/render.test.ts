import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { APPLICATION_REASONS } from "@/lib/applications/errors";
import { RELEASE_UNAVAILABLE } from "../release/release-view";

vi.mock("@/app/(app)/activity/actions", () => ({
  approveApplicationAction: vi.fn(),
  markSubmittedAction: vi.fn(),
  runWeeklyPassAction: vi.fn(),
  skipApplicationAction: vi.fn(),
}));

const { ActivityRow } = await import("./ActivityRow");
const { ActivityView } = await import("./ActivityView");
type Row = Parameters<typeof ActivityRow>[0]["row"];

const baseRow: Row = {
  id: "app-1",
  status: "prepared",
  approvedByYou: false,
  companyName: "Stripe",
  title: "SWE Intern",
  reason: "Fits campaign rules",
  jobUrl: "https://jobs.example.com/1",
  resumeFilename: null,
  packet: null,
  held: null,
  recordable: true,
  history: [],
};

const noop = () => undefined;
const renderRow = (row: Partial<Row>) =>
  renderToStaticMarkup(
    createElement(ActivityRow, { row: { ...baseRow, ...row }, busy: false, onApprove: noop, onSkip: noop, onMarkSubmitted: noop }),
  );

const stats = { weekCount: 0, weeklyCap: 5, waiting: 0, prepared: 0, submitted: 0, skipped: 0 };

describe("ActivityRow held explanation", () => {
  it("says nothing will be sent for a closed posting", () => {
    const html = renderRow({ held: APPLICATION_REASONS.postingClosed, recordable: false });
    expect(html).toContain("This posting has closed, so nothing will be sent for it.");
    expect(html).not.toContain("on its own");
  });

  it("asks for a reload when the release check is unavailable", () => {
    const html = renderRow({ held: RELEASE_UNAVAILABLE, recordable: false });
    expect(html).toContain("Inroad couldn&#x27;t run the release check. Reload to try again.");
  });

  it("keeps the rules copy for a rule hold", () => {
    expect(renderRow({ held: "Weekly limit reached", recordable: false })).toContain("becomes ready again on its own");
  });
});

describe("ActivityRow focus target", () => {
  it("gives the row title a programmatic focus target so focus can return after an action", () => {
    const html = renderRow({ status: "waiting", held: null, recordable: false });
    expect(html).toMatch(/<div class="t" tabindex="-1"[^>]*><span class="co">Stripe<\/span><span class="sr-only"> · <\/span><span class="role">SWE Intern<\/span><\/div>/);
  });
});

describe("ActivityView empty state", () => {
  it("points at the Run button when a campaign is active", () => {
    const html = renderToStaticMarkup(createElement(ActivityView, { rows: [], stats, campaignActive: true }));
    expect(html).toContain("Nothing yet. Run this week&#x27;s pass above, or press Prepare on a job.");
    expect(html).not.toContain("to get started");
  });

  it("links to the campaign when none is active", () => {
    const html = renderToStaticMarkup(createElement(ActivityView, { rows: [], stats, campaignActive: false }));
    expect(html).toContain("Nothing yet. Approve or resume a campaign to get started.");
    expect(html).toContain('href="/campaign"');
  });
});
