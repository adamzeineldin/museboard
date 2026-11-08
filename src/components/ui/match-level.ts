export type MatchLevel = "strong" | "good" | "fair";

export const STRONG_MATCH = 85;
export const GOOD_MATCH = 78;

const LABELS: Record<MatchLevel, string> = { strong: "Strong match", good: "Good match", fair: "Fair match" };

/** Clamp to an integer 0-100 (bad input becomes 0). */
export function normalizeScore(score: number): number {
  if (!Number.isFinite(score)) return 0;
  return Math.min(100, Math.max(0, Math.round(score)));
}

/** Strong (>=85), Good (>=78), otherwise Fair. Same thresholds as the prototype. */
export function matchLevel(score: number): MatchLevel {
  const value = normalizeScore(score);
  if (value >= STRONG_MATCH) return "strong";
  if (value >= GOOD_MATCH) return "good";
  return "fair";
}

export function matchLabel(score: number): string {
  return LABELS[matchLevel(score)];
}
