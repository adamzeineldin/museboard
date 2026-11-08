import { beforeEach, describe, expect, it, vi } from "vitest";
import { db, resetDb } from "@/test/db";
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
});

describe("redactSecrets", () => {
  it("removes URL credentials and link tokens", () => {
    expect(redactSecrets("connect smtp://me:pw@smtp.test:587 failed")).toBe("connect smtp://[redacted]@smtp.test:587 failed");
    expect(redactSecrets("GET /pause?token=abc.def&x=1")).toBe("GET /pause?token=[redacted]&x=1");
  });
});
