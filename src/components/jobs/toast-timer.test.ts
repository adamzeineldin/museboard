import { describe, expect, it } from "vitest";
import { isToastPaused, toastTimeoutMs, withPauseReason, TOAST_MS } from "./toast-timer";

describe("toast pause state", () => {
  it("is not paused by default", () => {
    expect(isToastPaused(null, 1)).toBe(false);
  });

  it("pauses while hovered or focused, and resumes when both end", () => {
    const hovered = withPauseReason(null, 1, "hover", true);
    expect(isToastPaused(hovered, 1)).toBe(true);
    const both = withPauseReason(hovered, 1, "focus", true);
    const focusOnly = withPauseReason(both, 1, "hover", false);
    expect(isToastPaused(focusOnly, 1)).toBe(true);
    expect(isToastPaused(withPauseReason(focusOnly, 1, "focus", false), 1)).toBe(false);
  });

  it("does not carry a pause over to a newer toast", () => {
    const paused = withPauseReason(null, 1, "focus", true);
    expect(isToastPaused(paused, 2)).toBe(false);
    expect(withPauseReason(paused, 2, "hover", true)).toEqual({ id: 2, hover: true, focus: false });
  });

  it("does not mutate the previous state", () => {
    const prev = withPauseReason(null, 1, "hover", true);
    withPauseReason(prev, 1, "focus", true);
    expect(prev).toEqual({ id: 1, hover: true, focus: false });
  });
});

describe("toastTimeoutMs", () => {
  it("has no timer without a toast or while paused", () => {
    expect(toastTimeoutMs(false, false)).toBeNull();
    expect(toastTimeoutMs(true, true)).toBeNull();
  });

  it("auto-dismisses an unpaused toast", () => {
    expect(toastTimeoutMs(true, false)).toBe(TOAST_MS);
  });
});
