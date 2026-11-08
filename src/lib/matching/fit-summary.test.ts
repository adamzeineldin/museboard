import { describe, expect, it } from "vitest";
import { fitSummary, truncateAtWord } from "./fit-summary";
import { SALES_POSTING, SWE_INTERN_POSTING, SWE_RESUME } from "./__fixtures__/texts";

describe("fitSummary", () => {
  it("returns three specific lines grounded in the resume and posting", () => {
    const lines = fitSummary(SWE_RESUME, SWE_INTERN_POSTING);
    expect(lines).toHaveLength(3);
    const [skills, project, why] = lines;
    expect(skills).toMatch(/^Matches the posting on /);
    expect(skills).toContain("Python");
    // The project line is a sentence copied from the resume, not invented.
    expect(project).toMatch(/^Relevant work: /);
    const quoted = project.replace(/^Relevant work: /, "").replace(/…$/, "");
    expect(SWE_RESUME).toContain(quoted.replace(/\.$/, ""));
    expect(why).toBe(
      "Why Stripe: Join Stripe's payments infrastructure teams building APIs used by millions of businesses.",
    );
    for (const line of lines) expect(line.length).toBeLessThanOrEqual(200);
  });

  it("says so plainly when nothing overlaps instead of inventing a fit", () => {
    const [skills, project, why] = fitSummary(SWE_RESUME, SALES_POSTING);
    expect(skills).toBe("No skills from the posting appear on the resume yet.");
    expect(project).toBe("No project on the resume mentions this role's skills directly.");
    expect(why).toMatch(/^Why Acme CRM: /);
  });

  it("copes with an empty resume and a missing description", () => {
    const lines = fitSummary("", { title: "Software Engineer Intern", description: null, companyName: "Ramp" });
    expect(lines).toEqual([
      "No skills from the posting appear on the resume yet.",
      "No project on the resume mentions this role's skills directly.",
      "Why Ramp: the posting doesn't describe the team yet, so ask your contact what they work on.",
    ]);
  });

  it("skips demo boilerplate and 'About the team' prefixes when picking the team sentence", () => {
    const [, , why] = fitSummary(SWE_RESUME, {
      title: "SWE Intern",
      companyName: "Meta",
      description: "Sample role for demos (no public feed). About the team: you'll help build React tooling used by every product team.",
    });
    expect(why).toBe("Why Meta: you'll help build React tooling used by every product team.");
  });

  it("ignores contact lines and skill lists when choosing a project sentence", () => {
    const resume = "jo@example.edu · Skills\nLanguages: Go, Python, Java, SQL\n- Built a Go service that streams market data over gRPC.";
    const [, project] = fitSummary(resume, { title: "Backend Intern", companyName: "X", description: "Go and gRPC services." });
    expect(project).toBe("Relevant work: Built a Go service that streams market data over gRPC.");
  });
});

describe("truncateAtWord", () => {
  it("leaves short text alone and cuts long text at a word boundary with an ellipsis", () => {
    expect(truncateAtWord("short text", 20)).toBe("short text");
    expect(truncateAtWord("one two three four five", 12)).toBe("one two…");
  });
});
