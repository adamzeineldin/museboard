import { describe, expect, it } from "vitest";
import { matchLabel, matchLevel, normalizeScore } from "./match-level";

describe("matchLevel", () => {
  it.each([
    [100, "strong"], [85, "strong"], [84.6, "strong"], [84, "good"], [78, "good"], [77, "fair"], [0, "fair"],
  ] as const)("%s -> %s", (score, level) => {
    expect(matchLevel(score)).toBe(level);
  });

  it("labels like the prototype", () => {
    expect(matchLabel(91)).toBe("Strong match");
    expect(matchLabel(80)).toBe("Good match");
    expect(matchLabel(71)).toBe("Fair match");
  });
});

describe("normalizeScore", () => {
  it("clamps and rounds", () => {
    expect(normalizeScore(-5)).toBe(0);
    expect(normalizeScore(140)).toBe(100);
    expect(normalizeScore(77.5)).toBe(78);
    expect(normalizeScore(Number.NaN)).toBe(0);
  });
});
