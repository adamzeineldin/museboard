import { describe, expect, it } from "vitest";
import { rawJob } from "./fixtures";
import { scrapedJobSchema } from "./runSchema";

// The scraper (Python) cuts text by code points, so the limits here must count code points too:
// an emoji is one character in Python but two UTF-16 units in JavaScript.
describe("scrapedJobSchema short text limits", () => {
  const astral = (count: number) => "\u{1F600}".repeat(count);

  it.each(["title", "location", "compensation", "department"] as const)(
    "accepts a %s of 500 code points even when it is longer in UTF-16",
    (field) => {
      expect(scrapedJobSchema.safeParse(rawJob("1", { [field]: astral(500) })).success).toBe(true);
    },
  );

  it.each(["title", "location", "compensation", "department"] as const)("rejects a %s over 500 code points", (field) => {
    expect(scrapedJobSchema.safeParse(rawJob("1", { [field]: astral(501) })).success).toBe(false);
  });
});
