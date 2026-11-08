import { describe, expect, it } from "vitest";
import { checkStatusTransition } from "./transitions";

describe("checkStatusTransition", () => {
  it("allows pausing an active, approved campaign and resuming it", () => {
    expect(checkStatusTransition("active", "paused", true)).toEqual({ ok: true });
    expect(checkStatusTransition("paused", "active", true)).toEqual({ ok: true });
  });

  it("allows revoking from active or paused, approved or not", () => {
    expect(checkStatusTransition("active", "revoked", true)).toEqual({ ok: true });
    expect(checkStatusTransition("paused", "revoked", true)).toEqual({ ok: true });
    expect(checkStatusTransition("paused", "revoked", false)).toEqual({ ok: true });
  });

  it("refuses to pause or resume a campaign that was never approved", () => {
    expect(checkStatusTransition("paused", "active", false)).toEqual({
      ok: false,
      reason: "Approve the campaign first.",
    });
    expect(checkStatusTransition("active", "paused", false)).toMatchObject({ ok: false });
  });

  it("refuses no-op transitions", () => {
    expect(checkStatusTransition("active", "active", true)).toEqual({ ok: false, reason: "The campaign is already active." });
    expect(checkStatusTransition("paused", "paused", true)).toEqual({ ok: false, reason: "The campaign is already paused." });
  });

  it("treats revoked and ended as terminal", () => {
    for (const target of ["active", "paused", "revoked"] as const) {
      expect(checkStatusTransition("revoked", target, true)).toMatchObject({ ok: false });
      expect(checkStatusTransition("ended", target, true)).toMatchObject({ ok: false });
    }
  });
});
