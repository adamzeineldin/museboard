import "server-only";

// Other milestones' modules this service calls, gathered in one place so tests can swap them out
// (vi.mock("@/lib/applications/deps")) and so the coupling is easy to see.
export { fitSummary } from "@/lib/matching/fit-summary";
export { bestContactAt, createReferralAskDraft } from "@/lib/outreach";
export { getDefaultResume, resumeDownloadPath } from "@/lib/resume";
