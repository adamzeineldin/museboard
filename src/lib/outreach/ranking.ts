// Pure ranking of contacts by how warm the path is. No DB access.
//
// Heuristic (documented, deterministic):
//   1. "known"  (strength 3): the relationship or notes say you have actually interacted: met, mentor,
//      coffee chat, worked with, teammate, colleague, manager, friend, classmate.
//   2. "alum"   (strength 2): a shared school (alum / alumni / alumna / alumnus).
//   3. "none"   (strength 1): anything else (e.g. a speaker you saw, a name from a list).
// Negated mentions ("Not met yet", "Never met", "Haven't met") don't count as interaction.
// Ties are broken by the most recently added contact (createdAt desc), then by id so the order is stable.

export type RelationshipTie = "known" | "alum" | "none";

export interface RankableContact {
  id: string;
  relationship: string;
  notes: string | null;
  createdAt: Date;
}

const KNOWN_PATTERN =
  /\b(mentor(?:ed|ing|s)?|coffee[\s-]?chats?|met|worked (?:with|together)|co-?workers?|colleagues?|teammates?|manager|friends?|classmates?)\b/gi;
const NEGATION_BEFORE = /\b(?:not|never|haven't|havent|hasn't|didn't|no)\s+(?:yet\s+)?$/i;
const ALUM_PATTERN = /\balum(?:ni|na|nae|nus)?\b/i;

const STRENGTH: Record<RelationshipTie, number> = { known: 3, alum: 2, none: 1 };

function mentionsInteraction(text: string): boolean {
  for (const match of text.matchAll(KNOWN_PATTERN)) {
    const before = text.slice(Math.max(0, match.index - 16), match.index);
    if (!NEGATION_BEFORE.test(before)) return true;
  }
  return false;
}

/** Classify how you know someone from the free-text relationship and notes. */
export function relationshipTie(relationship: string, notes?: string | null): RelationshipTie {
  const text = `${relationship} ${notes ?? ""}`;
  if (mentionsInteraction(text)) return "known";
  if (ALUM_PATTERN.test(text)) return "alum";
  return "none";
}

/** True when the relationship text says the contact went to the user's school. */
export function isAlumRelationship(relationship: string, notes?: string | null): boolean {
  return ALUM_PATTERN.test(`${relationship} ${notes ?? ""}`);
}

export function relationshipStrength(contact: Pick<RankableContact, "relationship" | "notes">): number {
  return STRENGTH[relationshipTie(contact.relationship, contact.notes)];
}

/** Strongest relationship first; ties go to the most recently added contact, then id. Returns a new array. */
export function rankContacts<T extends RankableContact>(contacts: readonly T[]): T[] {
  return contacts
    .map((contact) => ({ contact, strength: relationshipStrength(contact) }))
    .sort((a, b) => {
      if (b.strength !== a.strength) return b.strength - a.strength;
      const byDate = b.contact.createdAt.getTime() - a.contact.createdAt.getTime();
      if (byDate !== 0) return byDate;
      return a.contact.id < b.contact.id ? -1 : a.contact.id > b.contact.id ? 1 : 0;
    })
    .map(({ contact }) => contact);
}
