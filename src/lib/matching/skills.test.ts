import { describe, expect, it } from "vitest";
import { countSkillMentions, findSkills, SWE_SKILLS } from "./skills";

describe("findSkills", () => {
  it("finds languages, frameworks, infra and CS topics", () => {
    const text =
      "Python, TypeScript, C++ and C#; React with Next.js on Node.js; Docker, Kubernetes, AWS; data structures and algorithms; distributed systems.";
    expect(findSkills(text)).toEqual(
      expect.arrayContaining([
        "Python",
        "TypeScript",
        "C++",
        "C#",
        "React",
        "Next.js",
        "Node.js",
        "Docker",
        "Kubernetes",
        "AWS",
        "Data structures",
        "Algorithms",
        "Distributed systems",
      ]),
    );
  });

  it("does not treat everyday words as skills", () => {
    expect(findSkills("Go to market with a go-getter attitude; react quickly; a swift response.")).toEqual([]);
    expect(findSkills("Go-to-market strategy and networking events")).toEqual([]);
  });

  it("matches Go as a language in a list", () => {
    expect(findSkills("Languages: Go, Rust")).toEqual(["Go", "Rust"]);
    expect(findSkills("golang services")).toEqual(["Go"]);
  });

  it("keeps C++ and Java distinct from C and JavaScript", () => {
    expect(findSkills("JavaScript only")).toEqual(["JavaScript"]);
    expect(findSkills("C++ only")).toEqual(["C++"]);
  });

  it("returns nothing for empty text", () => {
    expect(findSkills("  ")).toEqual([]);
  });

  it("has unique skill names", () => {
    const names = SWE_SKILLS.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe("countSkillMentions", () => {
  it("counts every occurrence across patterns", () => {
    expect(countSkillMentions("Postgres here, PostgreSQL there, postgres again", "PostgreSQL")).toBe(3);
    expect(countSkillMentions("nothing", "Unknown skill")).toBe(0);
  });
});
