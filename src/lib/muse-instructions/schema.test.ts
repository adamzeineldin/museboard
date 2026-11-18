import { describe, expect, it } from "vitest";
import { MUSE_INSTRUCTIONS_MAX, museInstructionsSchema } from "./schema";

describe("museInstructionsSchema", () => {
  it("trims and keeps line breaks", () => {
    expect(museInstructionsSchema.parse("  Prefer remote.\r\nSkip crypto.  ")).toBe("Prefer remote.\nSkip crypto.");
  });

  it("stores an empty box as null", () => {
    expect(museInstructionsSchema.parse("   \n ")).toBeNull();
  });

  it("drops control characters", () => {
    expect(museInstructionsSchema.parse("a\u0007b")).toBe("ab");
  });

  it("rejects text over the limit", () => {
    const result = museInstructionsSchema.safeParse("x".repeat(MUSE_INSTRUCTIONS_MAX + 1));
    expect(result.success).toBe(false);
    expect(museInstructionsSchema.safeParse("x".repeat(MUSE_INSTRUCTIONS_MAX)).success).toBe(true);
  });
});
