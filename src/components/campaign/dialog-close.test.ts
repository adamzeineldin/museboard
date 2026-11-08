import { describe, expect, it } from "vitest";
import { nativeCloseAction } from "./dialog-close";

describe("nativeCloseAction", () => {
  it.each([
    [{ open: false, busy: false }, "none"],
    [{ open: false, busy: true }, "none"],
    [{ open: true, busy: false }, "cancel"],
    [{ open: true, busy: true }, "reopen"],
  ] as const)("when the browser closes the dialog with %o it should %s", (state, action) => {
    expect(nativeCloseAction(state)).toBe(action);
  });
});
