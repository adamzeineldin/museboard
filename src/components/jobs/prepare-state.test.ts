import { describe, expect, it } from "vitest";
import { canPrepare, prepareButtonState } from "./prepare-state";

describe("canPrepare", () => {
  it.each([
    [null, true],
    ["waiting", true],
    ["prepared", false],
    ["submitted", false],
    ["skipped", false],
  ])("%s -> %s", (status, expected) => {
    expect(canPrepare(status)).toBe(expected);
  });
});

describe("prepareButtonState", () => {
  it("marks a pending button aria-disabled and busy with a progress label", () => {
    expect(prepareButtonState(true)).toEqual({ label: "Preparing…", "aria-disabled": true, "aria-busy": true });
  });

  it("leaves an idle button without aria state", () => {
    expect(prepareButtonState(false)).toEqual({ label: "Prepare", "aria-disabled": undefined, "aria-busy": undefined });
  });
});
