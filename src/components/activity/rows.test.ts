import { describe, expect, it } from "vitest";
import { safeHttpUrl, toRowModels } from "./rows";

describe("toRowModels", () => {
  it("formats the audit trail in the user's zone and flags user approvals", () => {
    const [row] = toRowModels(
      [
        {
          id: "a1",
          status: "prepared",
          decidedBy: "user",
          reason: "Approved by you",
          companyName: "Stripe",
          title: "SWE Intern",
          jobUrl: "https://jobs.example.com/1",
          resumeFilename: "Resume_v3.pdf",
          packet: null,
          release: { allowed: true, reason: "Approved by you" },
          events: [{ id: "e1", actor: "user", action: "application.approved", payload: {}, createdAt: new Date("2026-11-07T19:14:00Z") }],
        },
      ],
      "America/New_York",
    );
    expect(row).toMatchObject({ approvedByYou: true, jobUrl: "https://jobs.example.com/1", held: null });
    expect(row.history).toEqual([
      { id: "e1", text: "You: Approved. Ready to submit.", when: "Nov 7, 2:14 PM", iso: "2026-11-07T19:14:00.000Z" },
    ]);
  });

  it("over cap after a user approval: the later campaign-prepared row is held, the others stay releasable", () => {
    const base = {
      status: "prepared" as const,
      companyName: "Stripe",
      title: "SWE Intern",
      jobUrl: "https://jobs.example.com/1",
      resumeFilename: null,
      packet: null,
      events: [],
    };
    const rows = toRowModels(
      [
        { ...base, id: "stripe", decidedBy: "campaign", reason: "Fits campaign rules", release: { allowed: true, reason: "Fits campaign rules" } },
        { ...base, id: "datadog", decidedBy: "campaign", reason: "Fits campaign rules", release: { allowed: false, reason: "Weekly limit reached" } },
        { ...base, id: "cloudflare", decidedBy: "user", reason: "Approved by you", release: { allowed: true, reason: "Approved by you" } },
        { ...base, id: "unknown", decidedBy: "campaign", reason: "Fits campaign rules", release: null },
      ],
      "America/New_York",
    );
    expect(rows.map((row) => [row.id, row.held])).toEqual([
      ["stripe", null],
      ["datadog", "Weekly limit reached"],
      ["cloudflare", null],
      ["unknown", "Release check unavailable"],
    ]);
  });

  it("only prepared rows can be held", () => {
    const [row] = toRowModels(
      [
        {
          id: "w",
          status: "waiting",
          decidedBy: "campaign",
          reason: "Weekly limit reached",
          companyName: "Ramp",
          title: "SWE Intern",
          jobUrl: "",
          resumeFilename: null,
          packet: null,
          release: null,
          events: [],
        },
      ],
      "UTC",
    );
    expect(row.held).toBeNull();
  });

  it("drops links that aren't http(s)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("http://x.test/a")).toBe("http://x.test/a");
  });
});
