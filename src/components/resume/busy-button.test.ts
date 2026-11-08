import { describe, expect, it, vi } from "vitest";
import { busyButtonState, guardBusyPress } from "./busy-button";

describe("busyButtonState", () => {
  it("marks a busy button aria-disabled and aria-busy, never disabled, so it keeps focus", () => {
    expect(busyButtonState(true)).toEqual({ "aria-disabled": true, "aria-busy": true });
  });

  it("leaves an idle button with no aria state", () => {
    expect(busyButtonState(false)).toEqual({ "aria-disabled": undefined, "aria-busy": undefined });
  });
});

describe("guardBusyPress", () => {
  it("cancels the press while busy and reports it was blocked", () => {
    const event = { preventDefault: vi.fn() };
    expect(guardBusyPress(true, event)).toBe(true);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  });

  it("lets the press through when idle", () => {
    const event = { preventDefault: vi.fn() };
    expect(guardBusyPress(false, event)).toBe(false);
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
});
