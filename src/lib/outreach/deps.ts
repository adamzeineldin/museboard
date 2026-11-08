import "server-only";

// Other milestones' modules this package calls, gathered in one place so tests can swap them out
// (vi.mock("@/lib/outreach/deps")) and the coupling is easy to see.
export { fitSummary } from "@/lib/matching";
export { getDefaultResume, resumeDownloadPath } from "@/lib/resume";
