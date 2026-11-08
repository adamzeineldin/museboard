import { describe, expect, it } from "vitest";
import { renderDigest } from "./render";
import type { DigestData, DigestLinks, DigestRole } from "./types";
import { digestWeek } from "./week";

const NOW = new Date("2026-11-09T13:00:00Z");
const TZ = "America/New_York";

const links: DigestLinks = {
  activity: "https://inroad.test/activity",
  campaign: "https://inroad.test/campaign",
  warmPaths: "https://inroad.test/warm-paths",
  pause: "https://inroad.test/pause?token=abc.def",
  unsubscribe: "https://inroad.test/digest/unsubscribe?token=ghi.jkl",
};

const role = (company: string, title: string, at: Date | null, reason = "Fits campaign rules"): DigestRole => ({ company, title, at, reason });

function data(overrides: Partial<DigestData> = {}): DigestData {
  return {
    userId: "user_1",
    firstName: "Jordan",
    week: digestWeek(NOW, TZ),
    submitted: { items: [role("Stripe", "Software Engineer Intern", new Date("2026-11-03T15:00:00Z"))], total: 1 },
    ready: { items: [role("Datadog", "Backend Intern", new Date("2026-11-04T15:00:00Z"), "Approved by you")], total: 1 },
    held: { items: [], total: 0 },
    waiting: { items: [role("Meta", "Software Engineer Intern, 2027", null, "Top choice: referral first")], total: 3 },
    referralDrafts: {
      items: [{ contactName: "Priya Shah", company: "Meta", title: "Software Engineer Intern, 2027", createdAt: NOW, markedSent: false }],
      total: 1,
    },
    campaign: { kind: "active", campaignId: "camp_1", weekCount: 2, weeklyCap: 5, endsOn: "2026-12-15", hasPendingChanges: false },
    ...overrides,
  };
}

const empty = { items: [], total: 0 };

describe("renderDigest content", () => {
  it("summarises the week in the subject and both bodies", () => {
    const message = renderDigest(data(), links);
    expect(message.subject).toBe("Your Inroad week of Nov 2: 1 sent, 3 waiting on you");
    for (const body of [message.text, message.html]) {
      expect(body).toContain("Nov 2 – Nov 8 (America/New_York time)");
      expect(body).toContain("Stripe · Software Engineer Intern");
      expect(body).toContain("Submitted Tue, Nov 3");
      expect(body).toContain("Datadog · Backend Intern");
      expect(body).toContain("Top choice: referral first");
      expect(body).toContain("Referral ask to Priya Shah");
      expect(body).toContain("Inroad never sends these");
      expect(body).toContain("2 of 5 applications that week.");
      expect(body).toContain("+ 2 more in Inroad");
    }
  });

  it("puts pause and unsubscribe links in both versions", () => {
    const message = renderDigest(data(), links);
    expect(message.text).toContain("Pause campaign: https://inroad.test/pause?token=abc.def");
    expect(message.text).toContain("Stop these emails: https://inroad.test/digest/unsubscribe?token=ghi.jkl");
    expect(message.html).toContain('href="https://inroad.test/pause?token=abc.def"');
    expect(message.html).toContain(">Pause campaign</a>");
    expect(message.html).toContain(">Stop these emails</a>");
  });

  it("shows submission days in the user's zone (late Sunday in New York is Monday in UTC)", () => {
    const lateSunday = new Date("2026-11-09T04:30:00Z");
    const ny = renderDigest(data({ submitted: { items: [role("Ramp", "SWE Intern", lateSunday)], total: 1 } }), links);
    expect(ny.text).toContain("Submitted Sun, Nov 8");
    const utc = renderDigest(
      data({ week: digestWeek(NOW, "UTC"), submitted: { items: [role("Ramp", "SWE Intern", lateSunday)], total: 1 } }),
      links,
    );
    expect(utc.text).toContain("Submitted Mon, Nov 9");
  });

  it("renders friendly empty sections and no pause button for a paused campaign", () => {
    const message = renderDigest(
      data({
        firstName: null,
        submitted: empty,
        ready: empty,
        held: empty,
        waiting: empty,
        referralDrafts: empty,
        campaign: { kind: "paused", campaignId: "camp_1", weekCount: 0, weeklyCap: 5, endsOn: "2026-12-15", hasPendingChanges: true },
      }),
      { ...links, pause: null },
    );
    expect(message.subject).toBe("Your Inroad week of Nov 2: 0 sent, 0 waiting on you");
    for (const body of [message.text, message.html]) {
      expect(body).toContain("Hi,");
      expect(body).toContain("Nothing was submitted that week.");
      expect(body).toContain("Nothing is waiting to be submitted.");
      expect(body).toContain("Nothing needs your decision.");
      expect(body).toContain("No new referral drafts that week.");
      expect(body).toContain("Your campaign is paused");
      expect(body).toContain("until you approve the new one");
      expect(body).not.toContain("Pause campaign");
    }
  });

  it("lists held rows in their own section only when there are some", () => {
    const quiet = renderDigest(data(), links);
    expect(quiet.text).not.toContain("Not going out right now");
    const held = renderDigest(data({ held: { items: [role("Acme", "Data Intern", null, "This posting has closed.")], total: 1 } }), links);
    for (const body of [held.text, held.html.replaceAll("&#39;", "'")]) {
      expect(body).toContain("Not going out right now");
      expect(body).toContain("1 application can't go out right now. It says why.");
      expect(body).toContain("Held: This posting has closed.");
      expect(body).not.toContain("held by your rules");
    }
    const many = renderDigest(data({ held: { items: [role("Acme", "Data Intern", null, "This posting has closed.")], total: 3 } }), links);
    expect(many.text).toContain("3 applications can't go out right now. Each one says why.");
  });

  it("counts held rows in the preheader only when there are some", () => {
    expect(renderDigest(data(), links).html).toContain("1 application went out, 1 ready to submit, 3 waiting on you.<");
    const pausedHeldOnly = renderDigest(
      data({
        submitted: empty,
        ready: empty,
        waiting: empty,
        referralDrafts: empty,
        held: { items: [role("Acme", "Data Intern", null, "Campaign is paused")], total: 2 },
        campaign: { kind: "paused", campaignId: "camp_1", weekCount: 0, weeklyCap: 5, endsOn: null, hasPendingChanges: false },
      }),
      { ...links, pause: null },
    );
    expect(pausedHeldOnly.html).toContain("0 applications went out, 0 ready to submit, 0 waiting on you, 2 held.<");
  });

  it.each([
    ["none", "You don't have a campaign"],
    ["not_approved", "isn't approved yet"],
    ["ended", "Your campaign has ended"],
    ["revoked", "Your campaign was revoked"],
  ] as const)("describes a %s campaign", (kind, phrase) => {
    const message = renderDigest(data({ campaign: { kind, campaignId: null, weekCount: 0, weeklyCap: null, endsOn: null, hasPendingChanges: false } }), {
      ...links,
      pause: null,
    });
    expect(message.text).toContain(phrase);
    expect(message.html).not.toContain("Pause campaign");
  });
});

describe("renderDigest HTML safety", () => {
  const hostile = data({
    firstName: `<img src=x onerror="alert(1)">`,
    submitted: { items: [role(`Evil & "Co" <script>`, `Intern'><a href="javascript:x">`, null)], total: 1 },
    referralDrafts: {
      items: [{ contactName: "<b>Pat</b>", company: "Acme", title: null, createdAt: NOW, markedSent: true }],
      total: 1,
    },
  });

  it("escapes every interpolated value", () => {
    const { html, text } = renderDigest(hostile, links);
    expect(html).not.toMatch(/<script|<img|<b>|href="javascript/);
    expect(html).toContain("Evil &amp; &quot;Co&quot; &lt;script&gt;");
    expect(html).toContain("Intern&#39;&gt;&lt;a href=&quot;javascript:x&quot;&gt;");
    expect(html).toContain("Referral ask to &lt;b&gt;Pat&lt;/b&gt;");
    expect(text).toContain(`Evil & "Co" <script>`);
    expect(text).toContain("you marked it sent");
  });

  it("refuses non-http links", () => {
    expect(() => renderDigest(data(), { ...links, activity: "javascript:alert(1)" })).toThrow(/http/);
  });

  it("strips newlines from values so they can't fake lines in the text version", () => {
    const { text } = renderDigest(data({ waiting: { items: [role("Acme", "Intern\n\nPause campaign: https://evil.test", null)], total: 1 } }), links);
    expect(text).not.toMatch(/^Pause campaign: https:\/\/evil/m);
  });

  it("is an accessible, inline-styled light email", () => {
    const { html } = renderDigest(data(), links);
    expect(html).toMatch(/^<!doctype html><html lang="en">/);
    expect(html).toContain('<meta name="color-scheme" content="light">');
    expect(html).not.toMatch(/<style|class=/);
    expect(html).toContain('role="presentation"');
    expect(html).toMatch(/<h1[^>]*>Hi Jordan,<\/h1>/);
    expect(html.match(/<h2/g)?.length).toBe(5);
    expect(html).toContain("#10B47E");
    expect(html).toContain("background:#0A7A56;color:#FFFFFF");
    expect(html).toContain(`<title>Your Inroad week of Nov 2: 1 sent, 3 waiting on you</title>`);
  });
});
