import { describe, expect, it } from "vitest";
import { cosine, LocalHashingEmbedder } from "./embedder";
import {
  KEYWORD_BOOST_CAP,
  KEYWORD_BOOST_PER_SKILL,
  MAX_REASON_SKILLS,
  matchedSkills,
  matchReasonsSchema,
  parseMatchReasons,
  scoreFromParts,
  scoreMatch,
  similarityPoints,
  textForJob,
} from "./score";
import * as F from "./__fixtures__/texts";

const embedder = new LocalHashingEmbedder();

async function scoreFixture(resume: string, posting: { title: string; description: string | null }) {
  const text = textForJob(posting);
  const [resumeVector, jobVector] = await embedder.embed([resume, text]);
  return scoreMatch({ resumeText: resume, jobText: text, similarity: cosine(resumeVector, jobVector) });
}

describe("calibration (local embedder)", () => {
  it.each([
    ["SWE intern (short feed text)", F.SWE_INTERN_POSTING],
    ["backend intern", F.BACKEND_INTERN_POSTING],
    ["long SWE intern with EEO boilerplate", F.LONG_SWE_INTERN_POSTING],
  ])("a relevant SWE resume vs %s lands in 75-92", async (_label, posting) => {
    const { score } = await scoreFixture(F.SWE_RESUME, posting);
    expect(score).toBeGreaterThanOrEqual(75);
    expect(score).toBeLessThanOrEqual(92);
  });

  it("a frontend new-grad role that shares the resume's stack still scores as a decent match", async () => {
    const { score } = await scoreFixture(F.SWE_RESUME, F.FRONTEND_NEW_GRAD_POSTING);
    expect(score).toBeGreaterThanOrEqual(65);
    expect(score).toBeLessThanOrEqual(92);
  });

  it.each([
    ["sales", F.SALES_POSTING],
    ["nursing", F.NURSING_POSTING],
    ["marketing intern", F.MARKETING_INTERN_POSTING],
  ])("an unrelated %s posting lands well below 60", async (_label, posting) => {
    const { score, reasons } = await scoreFixture(F.SWE_RESUME, posting);
    expect(score).toBeLessThan(45);
    expect(reasons.skills).toEqual([]);
  });

  it("a design resume does not look like a strong SWE match", async () => {
    const { score } = await scoreFixture(F.DESIGN_RESUME, F.SWE_INTERN_POSTING);
    expect(score).toBeLessThan(50);
  });

  it("ranks the more relevant posting higher", async () => {
    const backend = await scoreFixture(F.SWE_RESUME, F.BACKEND_INTERN_POSTING);
    const sales = await scoreFixture(F.SWE_RESUME, F.SALES_POSTING);
    expect(backend.score).toBeGreaterThan(sales.score + 40);
  });
});

describe("scoreFromParts", () => {
  it("maps similarity monotonically and caps the keyword boost", () => {
    expect(similarityPoints(0)).toBe(0);
    expect(similarityPoints(0.2)).toBeLessThan(similarityPoints(0.4));
    const many = scoreFromParts(0.3, 50);
    const capped = scoreFromParts(0.3, Math.ceil(KEYWORD_BOOST_CAP / KEYWORD_BOOST_PER_SKILL));
    expect(many).toBe(capped);
    expect(scoreFromParts(0.3, 1) - scoreFromParts(0.3, 0)).toBe(KEYWORD_BOOST_PER_SKILL);
  });

  it("clamps to 0-100 and treats bad input as zero", () => {
    expect(scoreFromParts(1, 100)).toBeLessThanOrEqual(100);
    expect(scoreFromParts(-1, 0)).toBe(0);
    expect(scoreFromParts(Number.NaN, Number.NaN)).toBe(0);
    expect(Number.isInteger(scoreFromParts(0.37, 3))).toBe(true);
  });
});

describe("matchedSkills / reasons", () => {
  it("returns skills found in both texts, ranked by mentions in the posting, at most six", () => {
    const resume = "Python, Go, Java, TypeScript, React, Docker, Kubernetes, AWS, SQL";
    const job = "Go Go Go services on Kubernetes. Python, Java, TypeScript, React, Docker, AWS and SQL welcome.";
    const skills = matchedSkills(resume, job);
    expect(skills).toHaveLength(MAX_REASON_SKILLS);
    expect(skills[0]).toBe("Go");
    expect(new Set(skills).size).toBe(skills.length);
  });

  it("stores similarity rounded to 3 decimals and validates the reasons shape", () => {
    const result = scoreMatch({ resumeText: "Python and Go", jobText: "Go and Python", similarity: 0.123456 });
    expect(result.reasons).toEqual({ skills: ["Python", "Go"], similarity: 0.123 });
    expect(matchReasonsSchema.parse(result.reasons)).toEqual(result.reasons);
  });

  it("parseMatchReasons tolerates bad stored JSON", () => {
    expect(parseMatchReasons({ skills: ["Go"], similarity: 0.5 })).toEqual({ skills: ["Go"], similarity: 0.5 });
    expect(parseMatchReasons("nope")).toEqual({ skills: [], similarity: 0 });
    expect(parseMatchReasons(null)).toEqual({ skills: [], similarity: 0 });
  });

  it("textForJob weights the title and copes with a missing description", () => {
    expect(textForJob({ title: "SWE Intern", description: null })).toBe("SWE Intern\nSWE Intern");
    expect(textForJob({ title: "SWE Intern", description: "Build things." })).toContain("Build things.");
  });
});
