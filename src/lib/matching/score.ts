import { z } from "zod";
import { countSkillMentions, findSkills } from "./skills";

// Match scoring v1 (brief sec. 5.1): embedding similarity scaled to points, plus a capped keyword
// boost for curated skills found in both the resume and the posting. Pure; no DB.
//
// Calibration (local embedder, fixtures in score.test.ts): a relevant SWE resume vs SWE intern
// postings lands ~77-91; sales, nursing and marketing postings land ~15-25.
// score = SIMILARITY_RANGE * (1 - exp(-cosine / SIMILARITY_SCALE)) + min(CAP, PER_SKILL * shared)

export const SIMILARITY_RANGE = 78;
export const SIMILARITY_SCALE = 0.25;
export const KEYWORD_BOOST_PER_SKILL = 5;
export const KEYWORD_BOOST_CAP = 20;
export const MAX_REASON_SKILLS = 6;

export const matchReasonsSchema = z.object({
  skills: z.array(z.string()).max(MAX_REASON_SKILLS),
  similarity: z.number().min(-1).max(1),
});

export type MatchReasons = z.infer<typeof matchReasonsSchema>;

export interface MatchScore {
  score: number;
  reasons: MatchReasons;
}

export interface ScoreInput {
  resumeText: string;
  jobText: string;
  /** Cosine similarity between the resume and job embeddings. */
  similarity: number;
}

const EMPTY_REASONS: MatchReasons = { skills: [], similarity: 0 };

/** The text scored for a job: the title counts twice so it outweighs boilerplate. */
export function textForJob(job: { title: string; description: string | null }): string {
  const description = job.description?.trim();
  return description ? `${job.title}\n${job.title}\n${description}` : `${job.title}\n${job.title}`;
}

const finiteOrZero = (value: number): number => (Number.isFinite(value) ? value : 0);

/** Points (0..SIMILARITY_RANGE) for a cosine similarity. Negative similarity earns nothing. */
export function similarityPoints(similarity: number): number {
  const value = Math.max(0, finiteOrZero(similarity));
  return SIMILARITY_RANGE * (1 - Math.exp(-value / SIMILARITY_SCALE));
}

export function keywordBoost(sharedSkillCount: number): number {
  const count = Math.max(0, Math.floor(finiteOrZero(sharedSkillCount)));
  return Math.min(KEYWORD_BOOST_CAP, count * KEYWORD_BOOST_PER_SKILL);
}

/** Integer score clamped to 0-100. */
export function scoreFromParts(similarity: number, sharedSkillCount: number): number {
  const raw = similarityPoints(similarity) + keywordBoost(sharedSkillCount);
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/** Curated skills in both texts, ranked by how often the posting mentions them (ties: list order). */
export function allSharedSkills(resumeText: string, jobText: string): string[] {
  const inResume = new Set(findSkills(resumeText));
  const shared = findSkills(jobText).filter((name) => inResume.has(name));
  const mentions = new Map(shared.map((name) => [name, countSkillMentions(jobText, name)]));
  return shared
    .map((name, order) => ({ name, order, mentions: mentions.get(name) ?? 0 }))
    .sort((a, b) => b.mentions - a.mentions || a.order - b.order)
    .map((entry) => entry.name);
}

export function matchedSkills(resumeText: string, jobText: string): string[] {
  return allSharedSkills(resumeText, jobText).slice(0, MAX_REASON_SKILLS);
}

export function scoreMatch({ resumeText, jobText, similarity }: ScoreInput): MatchScore {
  const shared = allSharedSkills(resumeText, jobText);
  const clamped = Math.max(-1, Math.min(1, finiteOrZero(similarity)));
  return {
    score: scoreFromParts(clamped, shared.length),
    reasons: { skills: shared.slice(0, MAX_REASON_SKILLS), similarity: Math.round(clamped * 1000) / 1000 },
  };
}

/** Read Match.reasons JSON written by any version; bad data becomes empty reasons. */
export function parseMatchReasons(value: unknown): MatchReasons {
  const parsed = matchReasonsSchema.safeParse(value);
  return parsed.success ? parsed.data : EMPTY_REASONS;
}
