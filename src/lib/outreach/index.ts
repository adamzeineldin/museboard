import "server-only";

// Contract: docs/ARCHITECTURE.md "Cross-module function contract" (milestone 6).
// Inroad only drafts outreach; it never sends anything (ground rule 4) and never offers rewards (ground rule 5).

export {
  bestContactAt,
  contactsByCompany,
  createContact,
  deleteContact,
  getContact,
  listContacts,
  requireContact,
  updateContact,
  type ContactWithCompany,
} from "./contacts";
export {
  createReferralAskDraft,
  draftOutreach,
  listOutreachForContact,
  previewOutreach,
  setOutreachSent,
  type DraftOutreachResult,
  type OutreachPreview,
  type OutreachWithJob,
} from "./drafts";
export { buildReferralPacket } from "./packet";
export { importContactsCsv, type ImportResult } from "./import";
export { OutreachError, userMessage } from "./errors";
export { rankContacts, relationshipTie } from "./ranking";
