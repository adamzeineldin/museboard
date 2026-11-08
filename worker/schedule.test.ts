import { describe, expect, it, vi } from "vitest";
import cron from "node-cron";
import { DIGEST_CRON, exclusive, registerSchedules, SCRAPE_CRON, type Scheduler } from "./schedule";

function fakeScheduler(): Scheduler & { calls: Array<{ expression: string; fn: () => unknown; options: unknown }> } {
  const calls: Array<{ expression: string; fn: () => unknown; options: unknown }> = [];
  return {
    calls,
    schedule(expression, fn, options) {
      calls.push({ expression, fn: fn as () => unknown, options });
      return { stop: vi.fn() };
    },
  };
}

describe("cron expressions", () => {
  it("are valid node-cron patterns", () => {
    expect(cron.validate(SCRAPE_CRON)).toBe(true);
    expect(cron.validate(DIGEST_CRON)).toBe(true);
  });

  it("scrapes every 6 hours", () => {
    expect(SCRAPE_CRON).toBe("0 */6 * * *");
  });
});

describe("registerSchedules", () => {
  it("registers the scrape job every 6 hours in UTC without overlap", async () => {
    const scheduler = fakeScheduler();
    const scrape = vi.fn(async () => undefined);

    const tasks = registerSchedules({ scrape }, scheduler);

    expect(tasks).toHaveLength(1);
    expect(scheduler.calls).toHaveLength(1);
    expect(scheduler.calls[0]).toMatchObject({
      expression: SCRAPE_CRON,
      options: { name: "scrape", timezone: "UTC", noOverlap: true },
    });
    await scheduler.calls[0].fn();
    expect(scrape).toHaveBeenCalledTimes(1);
  });

  it("registers the weekly digest only when a digest job is provided (milestone 8 hook)", () => {
    const scheduler = fakeScheduler();
    registerSchedules({ scrape: async () => undefined, digest: async () => undefined }, scheduler);
    expect(scheduler.calls.map((c) => c.expression)).toEqual([SCRAPE_CRON, DIGEST_CRON]);
  });
});

describe("exclusive", () => {
  it("skips a call while the previous one is still running", async () => {
    let release: () => void = () => undefined;
    const job = vi.fn(() => new Promise<void>((resolve) => (release = resolve)));
    const onSkip = vi.fn();
    const guarded = exclusive(job, onSkip);

    const first = guarded();
    await guarded();
    expect(job).toHaveBeenCalledTimes(1);
    expect(onSkip).toHaveBeenCalledTimes(1);

    release();
    await first;
    const third = guarded();
    release();
    await third;
    expect(job).toHaveBeenCalledTimes(2);
  });

  it("releases the lock after a failure", async () => {
    const job = vi.fn(async () => {
      throw new Error("boom");
    });
    const guarded = exclusive(job, () => undefined);
    await expect(guarded()).rejects.toThrow("boom");
    await expect(guarded()).rejects.toThrow("boom");
    expect(job).toHaveBeenCalledTimes(2);
  });
});
