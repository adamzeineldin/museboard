import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/test/db";
import type { BuiltDigest } from "./build";
import type { DigestEnvelope, DigestMailer } from "./mailer";
import { DIGEST_SENT_ACTION, redactSecrets, sendWeeklyDigests } from "./send";
import { approvedCampaign, LINK_CONFIG, MONDAY, newDigestWorld, seedApplication } from "./testing/fixtures";

function fakeMailer(failFor: (envelope: DigestEnvelope) => boolean = () => false): DigestMailer & { sent: DigestEnvelope[] } {
  const sent: DigestEnvelope[] = [];
  return {
    sent,
    async send(envelope) {
      if (failFor(envelope)) throw new Error("SMTP 550 for smtp://user:hunter2@mail.test");
      sent.push(envelope);
    },
  };
}

/** A mailer whose sends wait until release() is called, so two runs can overlap. */
function blockingMailer(): DigestMailer & { calls: DigestEnvelope[]; release: () => void } {
  const calls: DigestEnvelope[] = [];
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    calls,
    release: () => release(),
    async send(envelope) {
      calls.push(envelope);
      await gate;
    },
  };
}

/** A build stub that returns a sendable digest for any user, without loading anything. */
function stubBuild(): (userId: string) => Promise<BuiltDigest> {
  const start = new Date("2026-11-02T05:00:00Z");
  const end = new Date("2026-11-09T05:00:00Z");
  return async (userId) =>
    ({
      status: "ready",
      to: `${userId}@inroad.test`,
      data: {
        week: { start, end },
        submitted: { total: 0 },
        ready: { total: 0 },
        held: { total: 0 },
        waiting: { total: 0 },
        referralDrafts: { total: 0 },
        campaign: { kind: "none" },
      },
      links: { unsubscribe: "https://inroad.test/digest/unsubscribe?token=a.b" },
      message: { subject: "s", text: "t", html: "h" },
    }) as unknown as BuiltDigest;
}

describe("sendWeeklyDigests", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("sends to each eligible user, skips opt-outs and quiet users, and audits each send", async () => {
    const active = await newDigestWorld();
    await approvedCampaign(active);
    const busy = await newDigestWorld();
    await seedApplication(busy, { company: "Meta", title: "SWE Intern", status: "waiting", reason: "No approved campaign yet" });
    const optedOut = await newDigestWorld();
    await approvedCampaign(optedOut);
    await db.user.update({ where: { id: optedOut.user.id }, data: { digestOptOut: true } });
    await newDigestWorld(); // quiet: no campaign, nothing to report

    const mailer = fakeMailer();
    const summary = await sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG, logError: vi.fn() });
    expect(summary).toEqual({ users: 3, sent: 2, skipped: 1, failed: 0 });
    expect(mailer.sent.map((e) => e.to).sort()).toEqual([active.user.email, busy.user.email].sort());
    expect(mailer.sent.every((e) => e.unsubscribeUrl?.startsWith("https://inroad.test/digest/unsubscribe?token="))).toBe(true);
    const event = await db.auditEvent.findFirstOrThrow({ where: { userId: busy.user.id, action: DIGEST_SENT_ACTION } });
    expect(event).toMatchObject({ actor: "inroad", payload: expect.objectContaining({ waiting: 1, weekStart: "2026-11-02T05:00:00.000Z" }) });
  });

  it("isolates a failing user: the others still get theirs, and the log has no credentials", async () => {
    const worlds = [await newDigestWorld(), await newDigestWorld(), await newDigestWorld()];
    for (const world of worlds) await approvedCampaign(world);
    const failing = worlds[1]!;
    const mailer = fakeMailer((e) => e.userId === failing.user.id);
    const logError = vi.fn();

    const summary = await sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG, logError });
    expect(summary).toEqual({ users: 3, sent: 2, skipped: 0, failed: 1 });
    expect(logError).toHaveBeenCalledTimes(1);
    expect(logError.mock.calls[0]?.[0]).toContain(`failed for user ${failing.user.id}`);
    expect(logError.mock.calls[0]?.[0]).not.toContain("hunter2");
    expect(await db.auditEvent.count({ where: { userId: failing.user.id, action: DIGEST_SENT_ACTION } })).toBe(0);
  });

  it("isolates a failing build too", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    const build = vi.fn().mockRejectedValue(new Error("db hiccup"));
    const summary = await sendWeeklyDigests(MONDAY, { mailer: fakeMailer(), links: LINK_CONFIG, build, logError: vi.fn() });
    expect(summary).toEqual({ users: 1, sent: 0, skipped: 0, failed: 1 });
  });

  it("does not send the same week twice, but sends the next week", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    const mailer = fakeMailer();
    await sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG });
    const again = await sendWeeklyDigests(new Date(MONDAY.getTime() + 3_600_000), { mailer, links: LINK_CONFIG });
    expect(again).toEqual({ users: 1, sent: 0, skipped: 1, failed: 0 });
    const nextWeek = await sendWeeklyDigests(new Date(MONDAY.getTime() + 7 * 86_400_000), { mailer, links: LINK_CONFIG });
    expect(nextWeek.sent).toBe(1);
    expect(mailer.sent).toHaveLength(2);
  });

  it("sends once when two runs overlap for the same week", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    const mailer = blockingMailer();
    const first = sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG, logError: vi.fn() });
    await vi.waitFor(() => expect(mailer.calls).toHaveLength(1));
    let secondDone = false;
    const second = sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG, logError: vi.fn() }).finally(() => {
      secondDone = true;
    });
    // Either the second run finishes on its own (claimed slot) or it reaches the mailer too (double send).
    await vi.waitFor(() => expect(secondDone || mailer.calls.length > 1).toBe(true));
    mailer.release();
    expect(await first).toEqual({ users: 1, sent: 1, skipped: 0, failed: 0 });
    expect(await second).toEqual({ users: 1, sent: 0, skipped: 1, failed: 0 });
    expect(mailer.calls).toHaveLength(1);
  });

  it("retries a user whose send failed on the next run", async () => {
    const world = await newDigestWorld();
    await approvedCampaign(world);
    const failing = await sendWeeklyDigests(MONDAY, { mailer: fakeMailer(() => true), links: LINK_CONFIG, logError: vi.fn() });
    expect(failing.failed).toBe(1);
    const mailer = fakeMailer();
    expect(await sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG, logError: vi.fn() })).toMatchObject({ sent: 1, failed: 0 });
    expect(mailer.sent).toHaveLength(1);
  });

  it("pages through every user exactly once (more than two pages)", async () => {
    const total = 205;
    await db.user.createMany({
      data: Array.from({ length: total }, (_, i) => ({ email: `paged${i}@inroad.test`, timezone: "America/New_York" })),
    });
    const mailer = fakeMailer();
    const summary = await sendWeeklyDigests(MONDAY, { mailer, links: LINK_CONFIG, build: stubBuild(), logError: vi.fn() });
    expect(summary).toEqual({ users: total, sent: total, skipped: 0, failed: 0 });
    expect(mailer.sent).toHaveLength(total);
    expect(new Set(mailer.sent.map((e) => e.userId)).size).toBe(total);
  });
});

describe("redactSecrets", () => {
  it("removes URL credentials and link tokens", () => {
    expect(redactSecrets("connect smtp://me:pw@smtp.test:587 failed")).toBe("connect smtp://[redacted]@smtp.test:587 failed");
    expect(redactSecrets("GET /pause?token=abc.def&x=1")).toBe("GET /pause?token=[redacted]&x=1");
  });
});
