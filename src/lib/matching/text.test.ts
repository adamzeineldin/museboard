import { describe, expect, it } from "vitest";
import { stemLite, tokenize } from "./text";

describe("stemLite", () => {
  it.each([
    ["systems", "system"],
    ["libraries", "library"],
    ["classes", "class"],
    ["building", "build"],
    ["shipped", "shipp"],
    ["status", "status"],
    ["analysis", "analysis"],
    ["go", "go"],
    ["apis", "api"],
  ])("%s -> %s", (word, stem) => {
    expect(stemLite(word)).toBe(stem);
  });
});

describe("tokenize", () => {
  it("lowercases, drops stopwords and numbers, and stems", () => {
    expect(tokenize("We are building Distributed Systems in 2027!")).toEqual(["build", "distribut", "system"]);
  });

  it("keeps symbol-bearing tech names as single tokens", () => {
    const tokens = tokenize("C++, C#, Node.js, .NET and Next.js");
    expect(tokens).toEqual(expect.arrayContaining(["cplusplus", "csharp", "nodejs", "dotnet", "nextjs"]));
  });

  it("returns an empty list for empty or whitespace input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize("   \n\t ")).toEqual([]);
  });
});
