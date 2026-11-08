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
          events: [{ id: "e1", actor: "user", action: "application.approved", payload: {}, createdAt: new Date("2026-11-07T19:14:00Z") }],
        },
      ],
      "America/New_York",
    );
    expect(row).toMatchObject({ approvedByYou: true, jobUrl: "https://jobs.example.com/1" });
    expect(row.history).toEqual([
      { id: "e1", text: "You: Approved. Ready to submit.", when: "Nov 7, 2:14 PM", iso: "2026-11-07T19:14:00.000Z" },
    ]);
  });

  it("drops links that aren't http(s)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("not a url")).toBeNull();
    expect(safeHttpUrl("http://x.test/a")).toBe("http://x.test/a");
  });
});
