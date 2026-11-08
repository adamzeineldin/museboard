import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { listRecentAudit, writeAudit } from "./audit";

describe("writeAudit", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("stores an audit event with actor, action and payload", async () => {
    const user = await createTestUser();
    await writeAudit(user.id, "inroad", "application.prepared", { jobId: "greenhouse:stripe:1", ok: true, reason: "Fits campaign rules" });

    const events = await db.auditEvent.findMany({ where: { userId: user.id } });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      actor: "inroad",
      action: "application.prepared",
      payload: { jobId: "greenhouse:stripe:1", ok: true, reason: "Fits campaign rules" },
    });
  });

  it("serializes dates and drops undefined fields", async () => {
    const user = await createTestUser();
    const at = new Date("2026-11-07T12:00:00Z");
    await writeAudit(user.id, "user", "campaign.approved", { at, skipped: undefined });
    const event = await db.auditEvent.findFirstOrThrow({ where: { userId: user.id } });
    expect(event.payload).toEqual({ at: "2026-11-07T12:00:00.000Z" });
  });

  it("stores an empty object when the payload is undefined or null", async () => {
    const user = await createTestUser();
    await writeAudit(user.id, "muse", "tool.find_roles", undefined);
    await writeAudit(user.id, "muse", "tool.get_campaign", null);
    const events = await db.auditEvent.findMany({ where: { userId: user.id } });
    expect(events.map((e) => e.payload)).toEqual([{}, {}]);
  });

  it("rejects an unknown actor", async () => {
    const user = await createTestUser();
    // @ts-expect-error testing runtime validation
    await expect(writeAudit(user.id, "system", "x", {})).rejects.toThrow(/actor/i);
  });

  it("rejects an empty action or user id", async () => {
    const user = await createTestUser();
    await expect(writeAudit(user.id, "user", "  ", {})).rejects.toThrow(/action/i);
    await expect(writeAudit("", "user", "x", {})).rejects.toThrow(/userId/i);
  });

  it("rejects payloads that cannot be stored as JSON", async () => {
    const user = await createTestUser();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    await expect(writeAudit(user.id, "user", "x", circular)).rejects.toThrow(/JSON/);
    await expect(writeAudit(user.id, "user", "x", { n: BigInt(1) })).rejects.toThrow(/JSON/);
  });

  it("fails loudly when the user does not exist", async () => {
    await expect(writeAudit("missing-user", "user", "x", {})).rejects.toThrow();
  });
});

describe("listRecentAudit", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("returns the newest events first, filtered by actor and scoped to the user", async () => {
    const user = await createTestUser();
    const other = await createTestUser();
    await db.auditEvent.createMany({
      data: [
        { userId: user.id, actor: "muse", action: "tool.find_roles", payload: {}, createdAt: new Date("2026-11-01T00:00:00Z") },
        { userId: user.id, actor: "user", action: "campaign.approved", payload: {}, createdAt: new Date("2026-11-02T00:00:00Z") },
        { userId: user.id, actor: "muse", action: "tool.prepare_application", payload: {}, createdAt: new Date("2026-11-03T00:00:00Z") },
        { userId: other.id, actor: "muse", action: "tool.other_user", payload: {}, createdAt: new Date("2026-11-04T00:00:00Z") },
      ],
    });

    const events = await listRecentAudit(user.id, { actor: "muse", limit: 10 });
    expect(events.map((e) => e.action)).toEqual(["tool.prepare_application", "tool.find_roles"]);
  });

  it("filters by action prefix", async () => {
    const user = await createTestUser();
    await db.auditEvent.createMany({
      data: [
        { userId: user.id, actor: "muse", action: "muse.prepare_application", payload: {}, createdAt: new Date("2026-11-01T00:00:00Z") },
        { userId: user.id, actor: "muse", action: "application.prepared", payload: {}, createdAt: new Date("2026-11-02T00:00:00Z") },
        { userId: user.id, actor: "muse", action: "muse.find_roles", payload: {}, createdAt: new Date("2026-11-03T00:00:00Z") },
      ],
    });
    const events = await listRecentAudit(user.id, { actor: "muse", actionPrefix: "muse.", limit: 10 });
    expect(events.map((e) => e.action)).toEqual(["muse.find_roles", "muse.prepare_application"]);
  });

  it("clamps the limit", async () => {
    const user = await createTestUser();
    await db.auditEvent.createMany({
      data: Array.from({ length: 5 }, (_, i) => ({ userId: user.id, actor: "muse", action: `a${i}`, payload: {} })),
    });
    expect(await listRecentAudit(user.id, { limit: 2 })).toHaveLength(2);
    expect(await listRecentAudit(user.id, { limit: 0 })).toHaveLength(1);
  });
});
