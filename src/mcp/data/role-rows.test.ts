import { describe, expect, it } from "vitest";
import { buildRoleRows, roleStatus, type RoleRowsInput } from "./role-rows";

const job = (id: string, companyId: string, seenDay: number) => ({
  id,
  companyId,
  title: `Role ${id}`,
  companyName: companyId.toUpperCase(),
  location: "Remote",
  type: "intern",
  url: `https://jobs.test/${id}`,
  postedAt: null,
  firstSeenAt: new Date(Date.UTC(2026, 10, seenDay)),
});

describe("roleStatus", () => {
  it("prefers an existing application", () => {
    expect(roleStatus({ id: "a", status: "waiting", reason: "Weekly limit reached" }, { ok: true, reason: "Fits campaign rules" })).toEqual({
      status: "waiting",
      reason: "Weekly limit reached",
    });
  });

  it("maps the rule check to will_auto_apply, referral_first or held", () => {
    expect(roleStatus(undefined, { ok: true, reason: "Fits campaign rules" }).status).toBe("will_auto_apply");
    expect(roleStatus(undefined, { ok: false, reason: "Top choice: referral first", topChoice: true }).status).toBe("referral_first");
    expect(roleStatus(undefined, { ok: false, reason: "Match below 75%" })).toEqual({ status: "held", reason: "Match below 75%" });
    expect(roleStatus(undefined, null)).toEqual({ status: "held", reason: "Rule check unavailable" });
  });
});

describe("buildRoleRows", () => {
  const input: RoleRowsInput = {
    jobs: [job("a", "x", 1), job("b", "y", 2), job("c", "x", 3), job("d", "z", 4)],
    scores: new Map([
      ["a", 80],
      ["b", 90],
      ["c", 80],
    ]),
    applications: new Map([["b", { id: "app-b", status: "prepared", reason: "Fits campaign rules" }]]),
    ruleResults: new Map([
      ["a", { ok: true, reason: "Fits campaign rules" }],
      ["c", { ok: false, reason: "Weekly limit reached" }],
      ["d", { ok: false, reason: "No approved campaign yet" }],
    ]),
    contactCounts: new Map([["x", 2]]),
  };

  it("sorts by score, then newest first seen, with unscored roles last", () => {
    const rows = buildRoleRows(input);
    expect(rows.map((r) => r.jobId)).toEqual(["b", "c", "a", "d"]);
    expect(rows[0]).toMatchObject({ status: "prepared", applicationId: "app-b", warmPath: false, matchScore: 90 });
    expect(rows[1]).toMatchObject({ status: "held", reason: "Weekly limit reached", warmPath: true, warmPathContacts: 2 });
    expect(rows[3]).toMatchObject({ matchScore: null, firstSeenAt: "2026-11-04T00:00:00.000Z", postedAt: null });
    expect(rows[0]).not.toHaveProperty("seen");
  });

  it("caps the list", () => {
    expect(buildRoleRows({ ...input, limit: 2 })).toHaveLength(2);
  });
});
