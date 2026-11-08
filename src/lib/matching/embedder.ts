import { findSkills, SWE_SKILLS } from "./skills";
import { tokenize } from "./text";

// Embedding similarity for match scoring (brief sec. 5.1). The default embedder is local,
// deterministic and offline: hashed TF-IDF style vectors (feature hashing over stemmed unigrams and
// bigrams, sublinear term frequency, a fixed "domain IDF" that down-weights job-posting boilerplate
// and up-weights curated skill terms), L2-normalised so a dot product is the cosine.

export interface Embedder {
  /** Stable name stored nowhere yet, but useful in logs ("local-hash-v1", "hosted:<model>"). */
  readonly name: string;
  /** One vector per input text, same order. Vectors from one embedder are comparable with cosine(). */
  embed(texts: readonly string[]): Promise<number[][]>;
}

export const DEFAULT_DIMENSIONS = 2048;
const BIGRAM_WEIGHT = 0.5;
const BOILERPLATE_WEIGHT = 0.25;
const SKILL_TERM_WEIGHT = 1.6;

// Words that show up in almost every posting or resume and carry little signal about fit.
const BOILERPLATE: ReadonlySet<string> = new Set(
  (
    "experience team work role opportunity candidate strong skill ability year plus join help look looking " +
    "including include new great best well good responsibility requirement qualification prefer preferred " +
    "minimum basic required require must able week month summer fall spring program position company job " +
    "employee employer people customer business support environment culture benefit equal applicant apply " +
    "application status law gender race disability veteran opportunity pay salary range bonus location office " +
    "remote hybrid us usa time full part day make get one two three first like want need etc high level"
  )
    .split(" ")
    .flatMap((word) => tokenize(word)),
);

// Stemmed tokens that come from curated skill names (e.g. "python", "kubernet", "distribut").
const SKILL_TOKENS: ReadonlySet<string> = new Set(SWE_SKILLS.flatMap((entry) => tokenize(entry.name)));

/** 32-bit FNV-1a. Deterministic across runs and platforms. */
export function fnv1a(input: string, seed = 0x811c9dc5): number {
  let hash = seed >>> 0;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function termWeight(term: string): number {
  if (term.includes(" ")) return BIGRAM_WEIGHT;
  if (BOILERPLATE.has(term)) return BOILERPLATE_WEIGHT;
  if (SKILL_TOKENS.has(term)) return SKILL_TERM_WEIGHT;
  return 1;
}

function termCounts(text: string): Map<string, number> {
  const tokens = tokenize(text);
  // Skills found with the case-aware patterns become their own features too ("skill:go").
  const skillTerms = findSkills(text).map((name) => `skill:${name.toLowerCase()}`);
  const bigrams = tokens.slice(1).map((token, index) => `${tokens[index]} ${token}`);
  return [...tokens, ...bigrams, ...skillTerms].reduce(
    (counts, term) => counts.set(term, (counts.get(term) ?? 0) + 1),
    new Map<string, number>(),
  );
}

export function l2Normalize(vector: readonly number[]): number[] {
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  return norm === 0 ? [...vector] : vector.map((value) => value / norm);
}

/** Embed one text with signed feature hashing. Empty or stopword-only text yields the zero vector. */
export function hashEmbed(text: string, dimensions = DEFAULT_DIMENSIONS): number[] {
  const vector = new Array<number>(dimensions).fill(0);
  for (const [term, count] of termCounts(text)) {
    const index = fnv1a(term) % dimensions;
    const sign = (fnv1a(term, 0x9747b28c) & 1) === 0 ? 1 : -1;
    vector[index] += sign * (1 + Math.log(count)) * termWeight(term);
  }
  return l2Normalize(vector);
}

export class LocalHashingEmbedder implements Embedder {
  readonly name: string;

  constructor(private readonly dimensions = DEFAULT_DIMENSIONS) {
    if (!Number.isInteger(dimensions) || dimensions < 16) {
      throw new Error(`Embedder dimensions must be an integer >= 16 (got ${dimensions})`);
    }
    this.name = `local-hash-v1-${dimensions}`;
  }

  async embed(texts: readonly string[]): Promise<number[][]> {
    return texts.map((text) => hashEmbed(text, this.dimensions));
  }
}

/** Cosine similarity. Zero vectors give 0. Vectors of different lengths are a programming error. */
export function cosine(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length) throw new Error(`cosine: vector lengths differ (${a.length} vs ${b.length})`);
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / Math.sqrt(normA * normB);
}

export const EMBEDDER_ENV = "INROAD_EMBEDDER";

/**
 * Pick the embedder from INROAD_EMBEDDER: unset or "local" -> LocalHashingEmbedder.
 *
 * TODO(hosted-embeddings): plug a hosted embedding model in here, e.g. INROAD_EMBEDDER=hosted with
 * INROAD_EMBEDDER_MODEL / INROAD_EMBEDDER_API_KEY read from the environment, implementing Embedder
 * by batching texts to the provider. Scores are calibrated for the local embedder (see score.ts);
 * re-run the calibration fixtures in score.test.ts and adjust the scale when switching.
 */
export function getEmbedder(env: Readonly<Record<string, string | undefined>> = process.env): Embedder {
  const choice = (env[EMBEDDER_ENV] ?? "local").trim().toLowerCase();
  if (choice === "" || choice === "local") return new LocalHashingEmbedder();
  if (choice === "hosted") {
    throw new Error(`${EMBEDDER_ENV}=hosted is not wired up yet. Unset it to use the local embedder.`);
  }
  throw new Error(`Unknown ${EMBEDDER_ENV} value "${choice}". Use "local".`);
}
