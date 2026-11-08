import { describe, expect, it } from "vitest";
import { RULE_REASONS, type RuleCampaign } from "@/lib/rules";
import {
  buildJobCards,
  companyInitials,
  feedHeader,
  jobTags,
  parseJobFilter,
  parseShowLimit,
  postedLabel,
  safePostingUrl,
  emptyFeedCopy,
  filterHref,
  showMoreHref,
  statusChip,
  FEED_PAGE_SIZE,
  type FeedInput,
  type FeedJob,
} from "./job-view-model";

const NOW = new Date("2026-11-07T12:00:00Z");

const job = (overrides: Partial<FeedJob> & { id: string }): FeedJob => ({
  title: "Software Engineer Intern",
  location: "New York",
  type: "intern",
  postedAt: null,
  firstSeenAt: new Date("2026-11-07T10:00:00Z"),
  source: "Greenhouse feed",
  compensation: null,
  url: "https://boards.greenhouse.io/stripe/jobs/1",
  companyId: "co_stripe",
  companyName: "Stripe",
  ...overrides,
});

const campaign: RuleCampaign = {
  status: "active",
  timeZone: "America/New_York",
  inForce: {
    rules: {
      roles: ["intern"],
      autoCompanies: ["Stripe"],
      askFirstCompanies: ["Meta"],
      weeklyCap: 5,
      minMatch: 75,
      endsOn: "2026-12-15",
    },
  },
};

const baseInput = (overrides: Partial<FeedInput> = {}): FeedInput => ({
  jobs: [],
  matches: new Map(),
  applications: new Map(),
  contacts: new Map(),
  rules: { available: true, campaign, weekCount: 0 },
  filter: "recommended",
  limit: FEED_PAGE_SIZE,
  now: NOW,
  ...overrides,
});

describe("parseJobFilter / parseShowLimit", () => {
  it("accepts known filters and falls back to recommended", () => {
    expect(parseJobFilter("intern")).toBe("intern");
    expect(parseJobFilter("newgrad")).toBe("newgrad");
    expect(parseJobFilter("warm")).toBe("warm");
    expect(parseJobFilter(["warm", "intern"])).toBe("warm");
    expect(parseJobFilter("bogus")).toBe("recommended");
    expect(parseJobFilter(undefined)).toBe("recommended");
  });

  it("parses the show limit in page-size steps within bounds", () => {
    expect(parseShowLimit(undefined)).toBe(FEED_PAGE_SIZE);
    expect(parseShowLimit("100")).toBe(100);
    expect(parseShowLimit("73")).toBe(100);
    expect(parseShowLimit("-5")).toBe(FEED_PAGE_SIZE);
    expect(parseShowLimit("abc")).toBe(FEED_PAGE_SIZE);
    expect(parseShowLimit("999999")).toBe(500);
  });
});

describe("statusChip", () => {
  it("maps rule results to the prototype chips", () => {
    expect(statusChip({ ok: true, reason: RULE_REASONS.fits }, null)).toEqual({ tone: "ok", label: "Will auto-apply" });
    expect(statusChip({ ok: false, reason: RULE_REASONS.topChoice, topChoice: true }, null)).toEqual({
      tone: "warm",
      label: "Top choice: referral first",
    });
    expect(statusChip({ ok: false, reason: "Match below 75%" }, null)).toEqual({ tone: "neutral", label: "Match below 75%" });
    expect(statusChip(null, null)).toEqual({ tone: "neutral", label: "Rule check unavailable" });
  });

  it("lets an existing application override the rule check", () => {
    const ok = { ok: true, reason: RULE_REASONS.fits };
    expect(statusChip(ok, { status: "submitted", decidedBy: "campaign" })).toEqual({ tone: "ok", label: "Applied" });
    expect(statusChip(ok, { status: "submitted", decidedBy: "user" })).toEqual({ tone: "ok", label: "Applied · approved by you" });
    expect(statusChip(ok, { status: "waiting", decidedBy: "campaign" })).toEqual({ tone: "hold", label: "Waiting on you" });
    expect(statusChip(ok, { status: "skipped", decidedBy: "user" })).toEqual({ tone: "neutral", label: "Skipped" });
    const fits = { allowed: true, reason: RULE_REASONS.fits };
    expect(statusChip(null, { status: "prepared", decidedBy: "campaign", release: fits })).toEqual({ tone: "ok", label: "Ready to submit" });
  });

  it("agrees with the release check for prepared applications (same verdict as getSubmissionPacket)", () => {
    const ok = { ok: true, reason: RULE_REASONS.fits };
    const overCap = { allowed: false, reason: RULE_REASONS.weeklyLimit };
    expect(statusChip(ok, { status: "prepared", decidedBy: "campaign", release: overCap })).toEqual({
      tone: "hold",
      label: "Held: Weekly limit reached",
    });
    expect(statusChip(ok, { status: "prepared", decidedBy: "campaign", release: { allowed: false, reason: "Campaign is paused" } })).toEqual({
      tone: "hold",
      label: "Held: Campaign is paused",
    });
    expect(statusChip(ok, { status: "prepared", decidedBy: "user", release: { allowed: true, reason: "Approved by you" } })).toEqual({
      tone: "ok",
      label: "Ready to submit",
    });
    // No verdict loaded: never claim it is ready.
    expect(statusChip(ok, { status: "prepared", decidedBy: "campaign" })).toEqual({ tone: "hold", label: "Held: Release check unavailable" });
  });
});

describe("card fields", () => {
  it("builds initials like the prototype", () => {
    expect(companyInitials("Capital One")).toBe("CO");
    expect(companyInitials("Stripe")).toBe("S");
    expect(companyInitials("  ")).toBe("?");
  });

  it("uses postedAt, falling back to firstSeenAt", () => {
    expect(postedLabel(job({ id: "a", postedAt: new Date("2026-11-07T10:00:00Z") }), NOW)).toBe("2 hours ago");
    expect(postedLabel(job({ id: "a", firstSeenAt: new Date("2026-11-05T12:00:00Z") }), NOW)).toBe("2 days ago");
  });

  it("tags location, type and pay", () => {
    expect(jobTags(job({ id: "a", compensation: "$55–60/hr" }))).toEqual(["New York", "Internship", "$55–60/hr"]);
    expect(jobTags(job({ id: "a", location: "  ", type: "newgrad" }))).toEqual(["Location not listed", "Full-time"]);
  });
});

describe("feedHeader", () => {
  it("counts new matches and names the resume", () => {
    expect(feedHeader(3, 10, "Resume_v3.pdf")).toEqual({
      title: "3 new matches for you",
      subtitle: "From public company job feeds, ranked against",
      resumeName: "Resume_v3.pdf",
    });
    expect(feedHeader(1, 1, "cv.pdf").title).toBe("1 new match for you");
  });

  it("talks about open roles when there is no resume", () => {
    expect(feedHeader(0, 8, null)).toEqual({
      title: "8 open roles",
      subtitle: "From public company job feeds. Upload a resume to rank them against your experience.",
      resumeName: null,
    });
  });
});

describe("buildJobCards", () => {
  const jobs = [
    job({ id: "j-low", companyName: "Stripe", firstSeenAt: new Date("2026-11-07T11:00:00Z") }),
    job({ id: "j-high", companyName: "Stripe", firstSeenAt: new Date("2026-11-01T11:00:00Z") }),
    job({ id: "j-meta", companyId: "co_meta", companyName: "Meta" }),
    job({ id: "j-ng", companyId: "co_ramp", companyName: "Ramp", type: "newgrad" }),
    job({ id: "j-nomatch-new", companyName: "Stripe", firstSeenAt: new Date("2026-11-07T11:30:00Z") }),
    job({ id: "j-nomatch-old", companyName: "Stripe", firstSeenAt: new Date("2026-11-02T11:30:00Z") }),
    job({ id: "j-tie-new", companyName: "Stripe", postedAt: new Date("2026-11-06T00:00:00Z") }),
    job({ id: "j-tie-old", companyName: "Stripe", postedAt: new Date("2026-11-04T00:00:00Z") }),
  ];
  const matches = new Map([
    ["j-low", { score: 70, skills: ["Go"] }],
    ["j-high", { score: 91, skills: ["Python", "Go"] }],
    ["j-meta", { score: 88, skills: [] }],
    ["j-ng", { score: 80, skills: [] }],
    ["j-tie-new", { score: 76, skills: [] }],
    ["j-tie-old", { score: 76, skills: [] }],
  ]);
  const contacts = new Map([["co_meta", [{ id: "c1", name: "Priya Shah" }, { id: "c2", name: "Sam" }]]]);

  it("sorts by score desc, then recency, with unscored jobs last", () => {
    const { cards } = buildJobCards(baseInput({ jobs, matches, contacts }));
    expect(cards.map((c) => c.id)).toEqual([
      "j-high",
      "j-meta",
      "j-ng",
      "j-tie-new",
      "j-tie-old",
      "j-low",
      "j-nomatch-new",
      "j-nomatch-old",
    ]);
  });

  it("evaluates rules per job with the shared campaign state and week count", () => {
    const { cards } = buildJobCards(baseInput({ jobs, matches, contacts }));
    const chip = (id: string) => cards.find((c) => c.id === id)?.chip;
    expect(chip("j-high")).toEqual({ tone: "ok", label: "Will auto-apply" });
    expect(chip("j-meta")).toEqual({ tone: "warm", label: "Top choice: referral first" });
    expect(chip("j-ng")).toEqual({ tone: "neutral", label: "Not on your company list" });
    expect(chip("j-low")).toEqual({ tone: "neutral", label: "Match below 75%" });

    const capped = buildJobCards(baseInput({ jobs, matches, rules: { available: true, campaign, weekCount: 5 } }));
    expect(capped.cards.find((c) => c.id === "j-high")?.chip.label).toBe("Weekly limit reached");

    const none = buildJobCards(baseInput({ jobs, matches, rules: { available: true, campaign: null, weekCount: 0 } }));
    expect(none.cards[0].chip.label).toBe("No approved campaign yet");

    const down = buildJobCards(baseInput({ jobs, matches, rules: { available: false } }));
    expect(down.cards[0].chip.label).toBe("Rule check unavailable");
  });

  it("adds the warm-path contact, referral link, skills and ring score", () => {
    const { cards } = buildJobCards(baseInput({ jobs, matches, contacts }));
    const meta = cards.find((c) => c.id === "j-meta");
    expect(meta?.warmPath).toEqual({ contactId: "c1", label: "Priya Shah works here", referralHref: "/warm-paths?contact=c1&job=j-meta&kind=referral_ask" });
    const high = cards.find((c) => c.id === "j-high");
    expect(high).toMatchObject({ score: 91, skills: ["Python", "Go"], warmPath: null, companyInitials: "S" });
    expect(cards.find((c) => c.id === "j-nomatch-new")?.score).toBeNull();
  });

  it("filters by type and warm path, and reports totals", () => {
    expect(buildJobCards(baseInput({ jobs, matches, filter: "newgrad" })).cards.map((c) => c.id)).toEqual(["j-ng"]);
    expect(buildJobCards(baseInput({ jobs, matches, filter: "intern" })).cards).toHaveLength(7);
    const warm = buildJobCards(baseInput({ jobs, matches, contacts, filter: "warm" }));
    expect(warm.cards.map((c) => c.id)).toEqual(["j-meta"]);
    expect(warm.totalFiltered).toBe(1);
    expect(warm.totalOpen).toBe(8);
  });

  it("counts new matches as scored jobs without an application", () => {
    const applications = new Map([["j-high", { status: "submitted", decidedBy: "campaign" }]]);
    const result = buildJobCards(baseInput({ jobs, matches, applications }));
    expect(result.newMatchCount).toBe(5);
    expect(result.cards.find((c) => c.id === "j-high")?.chip).toEqual({ tone: "ok", label: "Applied" });
  });

  it("caps the page and says whether there is more", () => {
    const many = Array.from({ length: 60 }, (_, i) => job({ id: `j${i}` }));
    const first = buildJobCards(baseInput({ jobs: many }));
    expect(first.cards).toHaveLength(FEED_PAGE_SIZE);
    expect(first.hasMore).toBe(true);
    expect(first.nextLimit).toBe(FEED_PAGE_SIZE * 2);
    const all = buildJobCards(baseInput({ jobs: many, limit: 100 }));
    expect(all.cards).toHaveLength(60);
    expect(all.hasMore).toBe(false);
  });

  it("does not mutate its inputs", () => {
    const input = baseInput({ jobs, matches });
    const before = input.jobs.map((j) => j.id);
    buildJobCards(input);
    expect(input.jobs.map((j) => j.id)).toEqual(before);
  });
});

describe("safePostingUrl / emptyFeedCopy", () => {
  it("only keeps http(s) links", () => {
    expect(safePostingUrl("https://boards.greenhouse.io/x")).toBe("https://boards.greenhouse.io/x");
    expect(safePostingUrl("javascript:alert(1)")).toBeNull();
    expect(safePostingUrl("not a url")).toBeNull();
  });

  it("has copy for every filter", () => {
    for (const filter of ["recommended", "intern", "newgrad", "warm"] as const) {
      expect(emptyFeedCopy(filter).title.length).toBeGreaterThan(0);
    }
    expect(emptyFeedCopy("warm").body).toMatch(/Warm paths/);
  });

  it("exposes the posting link and application status on cards", () => {
    const { cards } = buildJobCards(
      baseInput({
        jobs: [job({ id: "a" }), job({ id: "b", url: "ftp://x" })],
        applications: new Map([["a", { status: "waiting", decidedBy: "campaign" }]]),
      }),
    );
    expect(cards.find((c) => c.id === "a")).toMatchObject({ postingUrl: "https://boards.greenhouse.io/stripe/jobs/1", applicationStatus: "waiting" });
    expect(cards.find((c) => c.id === "b")).toMatchObject({ postingUrl: null, applicationStatus: null });
  });
});

describe("filter links", () => {
  it("keeps the filter in the URL", () => {
    expect(filterHref("recommended")).toBe("/jobs");
    expect(filterHref("warm")).toBe("/jobs?filter=warm");
    expect(showMoreHref("recommended", 100)).toBe("/jobs?show=100");
    expect(showMoreHref("intern", 100)).toBe("/jobs?filter=intern&show=100");
  });
});
