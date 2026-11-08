import { describe, expect, it, vi } from "vitest";
import { formatDigestSummary, runDigestJob } from "./digest";

const logger = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const AT = new Date("2026-11-09T13:00:00Z");

describe("runDigestJob", () => {
  it("passes the start time to the sender and logs the summary", async () => {
    const log = logger();
    const send = vi.fn().mockResolvedValue({ users: 3, sent: 2, skipped: 1, failed: 0 });
    expect(await runDigestJob({ send, logger: log, now: () => AT })).toBe(true);
    expect(send).toHaveBeenCalledWith(AT);
    expect(log.info).toHaveBeenCalledWith("[worker] digest 2026-11-09T13:00:00.000Z done in 0.0s: 2 sent, 1 skipped, 0 failed of 3 users");
  });

  it("warns and reports false when some users failed", async () => {
    const log = logger();
    const send = vi.fn().mockResolvedValue({ users: 2, sent: 1, skipped: 0, failed: 1 });
    expect(await runDigestJob({ send, logger: log, now: () => AT })).toBe(false);
    expect(log.warn).toHaveBeenCalledWith(expect.stringContaining("1 failed of 2 users"));
  });

  it("never throws", async () => {
    const log = logger();
    const send = vi.fn().mockRejectedValue(new Error("AUTH_SECRET must be set"));
    expect(await runDigestJob({ send, logger: log, now: () => AT })).toBe(false);
    expect(log.error).toHaveBeenCalledWith("[worker] digest run failed at 2026-11-09T13:00:00.000Z: AUTH_SECRET must be set");
  });

  it("formats durations in seconds", () => {
    expect(formatDigestSummary(AT, 1500, { users: 0, sent: 0, skipped: 0, failed: 0 })).toContain("done in 1.5s");
  });
});
