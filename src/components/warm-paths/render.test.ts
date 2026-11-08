import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ContactList } from "./ContactList";
import type { ContactView } from "./load";
import { PacketView } from "./PacketView";

const contact = (overrides: Partial<ContactView> = {}): ContactView => ({
  id: "c1",
  name: "Priya N.",
  initials: "PN",
  role: "Software Engineer II, Payments",
  company: "Stripe",
  companyId: "co1",
  relationship: "Alum, class of 2023",
  notes: "Coffee chat Oct 14",
  email: null,
  source: "alumni-list",
  ...overrides,
});

describe("ContactList markup", () => {
  it("shows initials, name · role, company, relationship and notes, with Drafting on the selected row", () => {
    const html = renderToStaticMarkup(
      createElement(ContactList, {
        contacts: [contact(), contact({ id: "c2", name: "Jordan K.", initials: "JK", role: "", relationship: "", notes: null })],
        selectedId: "c1",
        kind: "referral_ask",
      }),
    );
    expect(html).toContain('aria-label="Your contacts"');
    expect(html).toContain(">PN<");
    expect(html).toContain("· Software Engineer II, Payments, Stripe");
    expect(html).toContain("Alum, class of 2023");
    expect(html).toContain("Coffee chat Oct 14");
    expect(html).toContain(">Drafting<");
    expect(html).toContain('aria-current="true"');
    expect(html).toContain('href="/warm-paths?contact=c1&amp;kind=referral_ask"');
    expect(html).toContain(">Draft ask<");
    expect(html).toContain("· Stripe");
    expect(html).toContain("No notes yet");
  });
});

describe("PacketView markup", () => {
  it("renders the role with a posting link, three fit lines and the resume download", () => {
    const html = renderToStaticMarkup(
      createElement(PacketView, {
        companyName: "Stripe",
        packet: {
          role: { jobId: "j1", title: "SWE Intern", company: "Stripe", url: "https://boards.greenhouse.io/stripe/jobs/1" },
          fitSummary: ["One.", "Two.", "Three."],
          resume: { id: "r1", filename: "Resume_v3.pdf", downloadPath: "/api/resumes/r1" },
        },
      }),
    );
    expect(html).toContain("SWE Intern at Stripe");
    expect(html).toContain('href="https://boards.greenhouse.io/stripe/jobs/1"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html.match(/<li>/g)).toHaveLength(3);
    expect(html).toContain('href="/api/resumes/r1"');
    expect(html).toContain("Resume_v3.pdf");
  });

  it("explains a missing role and a missing resume", () => {
    const html = renderToStaticMarkup(
      createElement(PacketView, { companyName: "Meta", packet: { role: null, fitSummary: ["a", "b", "c"], resume: null } }),
    );
    expect(html).toContain("No specific role at Meta");
    expect(html).toContain("No default resume yet");
  });
});
