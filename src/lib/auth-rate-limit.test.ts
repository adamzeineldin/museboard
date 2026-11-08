import { describe, expect, it, vi } from "vitest";
import {
  MAGIC_LINK_LIMITS,
  clientIpFrom,
  createMagicLinkLimiter,
  createMagicLinkRequestGuard,
  sendMagicLinkWithinLimit,
} from "./auth-rate-limit";

const TEN_MINUTES = 10 * 60_000;

function clock(start = 0) {
  let at = start;
  return { now: () => at, advance: (ms: number) => (at += ms) };
}

describe("createMagicLinkLimiter", () => {
  it("allows the per-email burst, then refuses that address", () => {
    const time = clock();
    const limiter = createMagicLinkLimiter({ now: time.now });
    const results = Array.from({ length: MAGIC_LINK_LIMITS.perEmail.capacity + 1 }, () => limiter.allow("victim@school.edu"));
    expect(results).toEqual([...Array(MAGIC_LINK_LIMITS.perEmail.capacity).fill(true), false]);
  });

  it("treats case and surrounding spaces as the same address", () => {
    const limiter = createMagicLinkLimiter({ perEmail: { capacity: 1, windowMs: TEN_MINUTES } });
    expect(limiter.allow("Victim@School.edu")).toBe(true);
    expect(limiter.allow("  victim@school.edu ")).toBe(false);
  });

  it("limits each address on its own", () => {
    const limiter = createMagicLinkLimiter({ perEmail: { capacity: 1, windowMs: TEN_MINUTES } });
    expect(limiter.allow("a@school.edu")).toBe(true);
    expect(limiter.allow("b@school.edu")).toBe(true);
    expect(limiter.allow("a@school.edu")).toBe(false);
  });

  it("allows the address again once the window has passed", () => {
    const time = clock();
    const limiter = createMagicLinkLimiter({ perEmail: { capacity: 1, windowMs: TEN_MINUTES }, now: time.now });
    expect(limiter.allow("a@school.edu")).toBe(true);
    expect(limiter.allow("a@school.edu")).toBe(false);
    time.advance(TEN_MINUTES);
    expect(limiter.allow("a@school.edu")).toBe(true);
  });

  it("has no shared cap across addresses, so one sender cannot lock everyone out", () => {
    const limiter = createMagicLinkLimiter({ perEmail: { capacity: 1, windowMs: TEN_MINUTES } });
    const results = Array.from({ length: 500 }, (_, i) => limiter.allow(`user${i}@school.edu`));
    expect(results.every(Boolean)).toBe(true);
  });
});

describe("clientIpFrom", () => {
  it("uses the first hop of x-forwarded-for", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }))).toBe("203.0.113.7");
  });

  it("falls back to unknown when the header is missing or blank", () => {
    expect(clientIpFrom(new Headers())).toBe("unknown");
    expect(clientIpFrom(new Headers({ "x-forwarded-for": " , 10.0.0.1" }))).toBe("unknown");
  });

  it("bounds the key length", () => {
    expect(clientIpFrom(new Headers({ "x-forwarded-for": "x".repeat(500) }))).toHaveLength(64);
  });
});

describe("createMagicLinkRequestGuard", () => {
  const small = { perEmail: { capacity: 2, windowMs: TEN_MINUTES }, perClient: { capacity: 3, windowMs: TEN_MINUTES } };

  it("lets requests through until the client's limit, then reports the per-client limit", () => {
    const guard = createMagicLinkRequestGuard(small);
    const results = ["a", "b", "c", "d"].map((name) => guard.check(`${name}@school.edu`, "203.0.113.7"));
    expect(results).toEqual([null, null, null, "per-client"]);
  });

  it("reports the per-email limit when one address is asked for too often", () => {
    const guard = createMagicLinkRequestGuard(small);
    expect(guard.check("victim@school.edu", "198.51.100.1")).toBeNull();
    expect(guard.check("Victim@School.edu", "198.51.100.2")).toBeNull();
    expect(guard.check("victim@school.edu", "198.51.100.3")).toBe("per-email");
  });

  it("limits each client on its own", () => {
    const guard = createMagicLinkRequestGuard({ ...small, perClient: { capacity: 1, windowMs: TEN_MINUTES } });
    expect(guard.check("a@school.edu", "203.0.113.7")).toBeNull();
    expect(guard.check("b@school.edu", "203.0.113.7")).toBe("per-client");
    expect(guard.check("c@school.edu", "203.0.113.8")).toBeNull();
  });

  it("does not use up the address's allowance when the client is already limited", () => {
    const guard = createMagicLinkRequestGuard({ perEmail: { capacity: 1, windowMs: TEN_MINUTES }, perClient: { capacity: 1, windowMs: TEN_MINUTES } });
    expect(guard.check("a@school.edu", "203.0.113.7")).toBeNull();
    expect(guard.check("b@school.edu", "203.0.113.7")).toBe("per-client");
    expect(guard.check("b@school.edu", "203.0.113.8")).toBeNull();
  });
});

describe("sendMagicLinkWithinLimit", () => {
  it("sends the first links for an address and silently skips the rest", async () => {
    const limiter = createMagicLinkLimiter();
    const send = vi.fn(async () => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      for (let i = 0; i < 4; i += 1) {
        await expect(sendMagicLinkWithinLimit("victim@school.edu", send, limiter)).resolves.toBeUndefined();
      }
      expect(send).toHaveBeenCalledTimes(MAGIC_LINK_LIMITS.perEmail.capacity);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]?.[0])).not.toContain("victim@school.edu");
      expect(String(warn.mock.calls[0]?.[0])).toContain("per-email");
    } finally {
      warn.mockRestore();
    }
  });

  it("passes delivery errors through", async () => {
    const limiter = createMagicLinkLimiter();
    const send = vi.fn(async () => {
      throw new Error("smtp down");
    });
    await expect(sendMagicLinkWithinLimit("a@school.edu", send, limiter)).rejects.toThrow("smtp down");
  });
});
