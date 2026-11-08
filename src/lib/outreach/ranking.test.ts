import { describe, expect, it } from "vitest";
import { rankContacts, relationshipStrength, relationshipTie } from "./ranking";

const at = (iso: string) => new Date(iso);

function contact(id: string, relationship: string, notes: string | null, createdAt = "2026-10-01T00:00:00Z") {
  return { id, relationship, notes, createdAt: at(createdAt) };
}

describe("relationshipTie", () => {
  it.each([
    ["Hackathon mentor, March 2026", null, "known"],
    ["Alum, class of 2023", "Coffee chat Oct 14", "known"],
    ["Met at a career fair", null, "known"],
    ["Worked with them at a startup", null, "known"],
    ["Former teammate", null, "known"],
    ["Alum, class of 2021", "Not contacted yet", "alum"],
    ["Alumni list", null, "alum"],
    ["alumna", null, "alum"],
    ["Friend of a friend", null, "known"],
    ["", null, "none"],
    ["Found on the company blog", "Not contacted yet", "none"],
  ] as const)("%s / %s -> %s", (relationship, notes, expected) => {
    expect(relationshipTie(relationship, notes)).toBe(expected);
  });

  it("ignores negated contact words", () => {
    expect(relationshipTie("Alum", "Not met yet")).toBe("alum");
    expect(relationshipTie("Speaker at a meetup", "Never met")).toBe("none");
    expect(relationshipTie("Alum", "Haven't met")).toBe("alum");
  });

  it("does not treat words containing 'met' as meeting", () => {
    expect(relationshipTie("Metrics team lead", null)).toBe("none");
  });
});

describe("relationshipStrength", () => {
  it("orders known > alum > other", () => {
    const known = relationshipStrength(contact("a", "Hackathon mentor", null));
    const alum = relationshipStrength(contact("b", "Alum, class of 2024", null));
    const other = relationshipStrength(contact("c", "Saw their talk", null));
    expect(known).toBeGreaterThan(alum);
    expect(alum).toBeGreaterThan(other);
  });
});

describe("rankContacts", () => {
  it("puts the strongest relationship first", () => {
    const ranked = rankContacts([
      contact("other", "Conference speaker", null, "2026-10-30T00:00:00Z"),
      contact("alum", "Alum, class of 2021", "Not contacted yet", "2026-10-29T00:00:00Z"),
      contact("mentor", "Hackathon mentor, March 2026", "Met once", "2026-01-01T00:00:00Z"),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(["mentor", "alum", "other"]);
  });

  it("breaks ties by the most recently added contact, then by id", () => {
    const ranked = rankContacts([
      contact("b", "Alum", null, "2026-09-01T00:00:00Z"),
      contact("c", "Alum", null, "2026-10-01T00:00:00Z"),
      contact("a", "Alum", null, "2026-10-01T00:00:00Z"),
    ]);
    expect(ranked.map((c) => c.id)).toEqual(["a", "c", "b"]);
  });

  it("does not mutate the input array", () => {
    const input = [contact("x", "Other", null), contact("y", "Mentor", null)];
    const copy = [...input];
    rankContacts(input);
    expect(input).toEqual(copy);
  });

  it("returns an empty list for no contacts", () => {
    expect(rankContacts([])).toEqual([]);
  });
});
