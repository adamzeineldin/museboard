import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// WCAG 2.1 AA (1.4.3): every token pair used for small text must reach 4.5:1, in light and dark.
// Tokens are read from globals.css, so changing a colour re-runs this audit.

const CSS = readFileSync(path.resolve(import.meta.dirname, "../globals.css"), "utf8");

function tokens(block: string): Record<string, string> {
  return Object.fromEntries([...block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]]));
}

const light = tokens(CSS.slice(CSS.indexOf(":root{"), CSS.indexOf("}", CSS.indexOf(":root{"))));
const darkStart = CSS.indexOf(':root[data-theme="dark"]{');
const dark = tokens(CSS.slice(darkStart, CSS.indexOf("}", darkStart)));

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** [text token, background token, where it is used]. "#fff" is a literal. */
const TEXT_PAIRS: Array<[string, string, string]> = [
  ["fg", "bg", "body text"],
  ["fg", "surface", "cards, panels"],
  ["fg", "surface-2", "packet, drafts, camp card"],
  ["muted", "bg", "inputs hint on page"],
  ["muted", "surface", "muted copy on cards"],
  ["muted", "surface-2", "neutral chip, tags, tool codes"],
  ["muted", "accent-soft", "company toggle hint (auto)"],
  ["muted", "warm-soft", "company toggle hint (ask first)"],
  ["ok", "ok-soft", "ok chip"],
  ["hold", "hold-soft", "hold chip"],
  ["warm", "warm-soft", "warm chip"],
  ["hold", "surface", "field errors, error state title"],
  ["accent-ink", "accent-soft", "current nav item, ghost button, pressed toggle, match level"],
  ["accent-ink", "surface", "tool names in the Muse panel"],
  ["accent-fg", "accent", "primary buttons, user messages"],
  ["bg", "fg", "pressed filter pill, toast"],
  ["surface", "hold", "error toast, waiting badge"],
  ["fg", "warm-soft", "banner"],
  ["fg", "hold-soft", "hold banner"],
  ["fg", "accent-soft", "auto company toggle"],
];

describe.each([
  ["light", light],
  ["dark", dark],
])("colour contrast (%s)", (_theme, palette) => {
  it.each(TEXT_PAIRS)("%s on %s (%s) is at least 4.5:1", (fg, bg) => {
    expect(palette[fg], `missing --${fg}`).toBeDefined();
    expect(palette[bg], `missing --${bg}`).toBeDefined();
    expect(contrast(palette[fg], palette[bg])).toBeGreaterThanOrEqual(4.5);
  });
});

/** Non-text (1.4.11): the focus ring must reach 3:1 against every surface it can sit on. */
describe.each([
  ["light", light],
  ["dark", dark],
])("focus ring contrast (%s)", (_theme, palette) => {
  it.each(["bg", "surface", "surface-2"])("accent-ink on %s is at least 3:1", (bg) => {
    expect(contrast(palette["accent-ink"], palette[bg])).toBeGreaterThanOrEqual(3);
  });
});

describe("the dark tokens are the same in both dark blocks", () => {
  it("prefers-color-scheme and data-theme=dark agree", () => {
    const mediaStart = CSS.indexOf("@media (prefers-color-scheme: dark)");
    expect(tokens(CSS.slice(mediaStart, CSS.indexOf("}}", mediaStart)))).toEqual(dark);
  });
});
