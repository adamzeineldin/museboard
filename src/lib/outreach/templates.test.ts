import { describe, expect, it } from "vitest";
import {
  MAX_DRAFT_WORDS,
  composeDraft,
  draftFitLine,
  containsRewardLanguage,
  firstName,
  wordCount,
  type DraftInput,
} from "./templates";

const base: DraftInput = {
  kind: "coffee_chat",
  contact: { name: "Priya Natarajan", role: "Software Engineer II", relationship: "Conference speaker", notes: null },
  companyName: "Stripe",
  job: { title: "Software Engineer Intern, Summer 2027" },
  fitLine: "Your distributed systems coursework lines up with the team's API work.",
  sender: { name: "Adam Zeineldin", school: "State University" },
};

const withKind = (kind: DraftInput["kind"], overrides: Partial<DraftInput> = {}): DraftInput => ({ ...base, ...overrides, kind });

describe("firstName", () => {
  it.each([
    ["Priya N.", "Priya"],
    ["  marcus   t. ", "marcus"],
    ["Dr. Dana Lee", "Dana"],
    ["Lee, Dana", "Dana"],
    ["Cher", "Cher"],
    ["", "there"],
  ])("%s -> %s", (name, expected) => {
    expect(firstName(name)).toBe(expected);
  });
});

describe("wordCount", () => {
  it("counts whitespace-separated words", () => {
    expect(wordCount("Hi Priya,\n\nthanks  for reading.")).toBe(5);
    expect(wordCount("   ")).toBe(0);
  });
});

describe("composeDraft", () => {
  it.each(["coffee_chat", "referral_ask"] as const)("%s stays under the word limit", (kind) => {
    const draft = composeDraft(withKind(kind));
    expect(wordCount(draft)).toBeLessThan(MAX_DRAFT_WORDS);
  });

  it("greets the contact by first name only and signs with the sender's first name", () => {
    const draft = composeDraft(base);
    expect(draft.startsWith("Hi Priya,")).toBe(true);
    expect(draft).not.toContain("Natarajan");
    expect(draft.trimEnd().endsWith("Adam")).toBe(true);
    expect(draft).not.toContain("Zeineldin");
  });

  it("is specific: the contact's role, the company, the job title and one fit line", () => {
    const draft = composeDraft(base);
    expect(draft).toContain("a Software Engineer II at Stripe");
    expect(draft).toContain("Software Engineer Intern, Summer 2027");
    expect(draft).toContain("My distributed systems coursework lines up with the team's API work.");
  });

  it("uses 'an' before a vowel sound", () => {
    const draft = composeDraft({ ...base, contact: { ...base.contact, role: "Engineering Manager" } });
    expect(draft).toContain("an Engineering Manager at Stripe");
  });

  it.each(["coffee_chat", "referral_ask"] as const)("%s always gives an easy out", (kind) => {
    const draft = composeDraft(withKind(kind));
    expect(draft).toContain("Either way, thanks for reading.");
  });

  it("coffee chat asks for 15 minutes, referral ask asks about a referral", () => {
    expect(composeDraft(withKind("coffee_chat"))).toMatch(/15 minutes/);
    const ask = composeDraft(withKind("referral_ask"));
    expect(ask).toMatch(/comfortable referring me/);
    expect(ask).toMatch(/packet/);
  });

  it("mentions the shared school only when the relationship says the contact is an alum", () => {
    const alum = composeDraft({ ...base, contact: { ...base.contact, relationship: "Alum, class of 2023" } });
    expect(alum).toContain("fellow State University alum");
    const notAlum = composeDraft(base);
    expect(notAlum).not.toMatch(/alum/i);
  });

  it("falls back to 'my school' for an alum when the sender has no school on file", () => {
    const draft = composeDraft({
      ...base,
      sender: { name: "Adam", school: null },
      contact: { ...base.contact, relationship: "Alumni list" },
    });
    expect(draft).toContain("an alum of my school");
  });

  it("mentions a prior connection only when the relationship or notes say so", () => {
    const known = composeDraft({ ...base, contact: { ...base.contact, notes: "Coffee chat Oct 14" } });
    expect(known).toMatch(/good to connect before/);
    expect(composeDraft(base)).not.toMatch(/connect before/);
  });

  it("works without a job, a fit line, a school or a sender name", () => {
    const draft = composeDraft({ ...base, job: null, fitLine: null, sender: { name: null, school: null } });
    expect(draft).toContain("software engineering roles at Stripe");
    expect(draft).toContain("I'm a student and saw");
    expect(draft.trimEnd().endsWith("Either way, thanks for reading.")).toBe(true);
    expect(wordCount(draft)).toBeLessThan(MAX_DRAFT_WORDS);
  });

  it("stays under the limit even with very long inputs", () => {
    const long = "word ".repeat(60).trim();
    for (const kind of ["coffee_chat", "referral_ask"] as const) {
      const draft = composeDraft({
        ...base,
        kind,
        contact: { ...base.contact, role: long, relationship: "Alum" },
        job: { title: long },
        fitLine: long,
        companyName: "Very Long Company Name Incorporated Holdings",
        sender: { name: "Adam", school: long },
      });
      expect(wordCount(draft)).toBeLessThan(MAX_DRAFT_WORDS);
      expect(draft).toContain("Either way, thanks for reading.");
    }
  });

  it("never offers money or rewards and never claims it was sent automatically", () => {
    const variants: DraftInput[] = [];
    for (const kind of ["coffee_chat", "referral_ask"] as const) {
      for (const relationship of ["Alum, class of 2023", "Hackathon mentor", "Other"]) {
        for (const job of [base.job, null]) {
          variants.push({ ...base, kind, job, contact: { ...base.contact, relationship } });
        }
      }
    }
    for (const input of variants) {
      const draft = composeDraft(input);
      expect(containsRewardLanguage(draft), draft).toBe(false);
      expect(draft).not.toMatch(/automatic|auto-?sent|sent by inroad|on my behalf|\bbot\b/i);
    }
  });

  it("rewrites a fit line addressed to the user ('Your ...') into the sender's voice", () => {
    expect(composeDraft({ ...base, fitLine: "your React work matches." })).toContain("My React work matches.");
    expect(composeDraft({ ...base, fitLine: "Built a Go service." })).toContain("Built a Go service.");
  });

  it("does not add a trailing fit line period twice", () => {
    const draft = composeDraft({ ...base, fitLine: "Strong Go and Kubernetes overlap" });
    expect(draft).toContain("Strong Go and Kubernetes overlap.");
    expect(draft).not.toContain("..");
  });
});

describe("containsRewardLanguage", () => {
  it.each([
    "I'd be happy to pay you for a referral",
    "Here's a $50 gift card",
    "I can send a giftcard",
    "There's a referral bonus in it for you",
    "I'll compensate you",
    "Can I Venmo you?",
    "a small reward",
    "I'll buy you lunch as a thank-you incentive",
  ])("flags %s", (text) => {
    expect(containsRewardLanguage(text)).toBe(true);
  });

  it("does not flag ordinary outreach", () => {
    expect(containsRewardLanguage("Would you be open to a 15 minute chat? Either way, thanks for reading.")).toBe(false);
  });
});

describe("draftFitLine", () => {
  it("turns the skills line into first person", () => {
    expect(draftFitLine("Matches the posting on Go, Postgres and React.")).toBe("I've worked with Go, Postgres and React, which the posting asks for.");
  });

  it("drops lines that say there is no fit to report", () => {
    expect(draftFitLine("No skills from the posting appear on the resume yet.")).toBeNull();
    expect(draftFitLine("")).toBeNull();
    expect(draftFitLine(undefined)).toBeNull();
  });

  it("keeps other lines as a sentence", () => {
    expect(draftFitLine("Relevant work: Built a Go service")).toBe("Relevant work: Built a Go service.");
  });
});
