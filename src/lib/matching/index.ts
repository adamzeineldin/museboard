import "server-only";

// Contract: docs/ARCHITECTURE.md (src/lib/matching). fitSummary is pure: import it from
// "@/lib/matching/fit-summary" in code that must not pull in server-only modules.
export { recomputeMatches, type RecomputeDeps } from "./recompute";
export { cosine, getEmbedder, LocalHashingEmbedder, EMBEDDER_ENV, type Embedder } from "./embedder";
export { parseMatchReasons, scoreMatch, textForJob, type MatchReasons, type MatchScore } from "./score";
export { fitSummary, type FitSummaryJob } from "./fit-summary";
