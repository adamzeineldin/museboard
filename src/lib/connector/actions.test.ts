import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_CONNECTOR_STATE } from "@/components/connector/view-model";
import { createTestUser, db, resetDb } from "@/test/db";
import { MAX_ACTIVE_TOKENS } from "./constants";
import { createConnectorToken } from "./tokens";

const { getSessionUserId, revalidatePath } = vi.hoisted(() => ({ getSessionUserId: vi.fn(), revalidatePath: vi.fn() }));
vi.mock("@/lib/current-user", () => ({ getSessionUserId }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { createConnectorTokenAction, revokeConnectorTokenAction } from "./actions";

const form = (entries: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
};

describe("Connect Muse actions", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("creates a token for the session user and returns the plaintext once", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    const state = await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: "Muse", scope: "read" }));
    expect(state).toMatchObject({ status: "success", created: { name: "Muse", scopeLabel: "Read only", token: expect.stringMatching(/^inr_/) } });
    expect(await db.connectorToken.findMany({ where: { userId: user.id } })).toEqual([expect.objectContaining({ scope: "read" })]);
    expect(revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("refuses signed-out users, bad scopes and bad names with friendly messages", async () => {
    getSessionUserId.mockResolvedValue(null);
    expect((await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: "Muse", scope: "read" }))).message).toMatch(/Sign in again/);

    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    expect(await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: "Muse", scope: "admin" }))).toMatchObject({
      status: "error",
      message: "Choose read only or read and write.",
    });
    expect(await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: " ", scope: "write" }))).toMatchObject({ status: "error" });
    expect(await db.connectorToken.count()).toBe(0);
  });

  it("ties a name error to the name field, but not a limit error", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    expect(await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: " ", scope: "write" }))).toMatchObject({
      status: "error",
      field: "name",
    });
    expect(await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: "Muse", scope: "admin" }))).toMatchObject({
      status: "error",
      field: "scope",
    });
    for (let i = 0; i < MAX_ACTIVE_TOKENS; i += 1) await createConnectorToken(user.id, `Token ${i}`, "read");
    const limit = await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: "One more", scope: "read" }));
    expect(limit).toMatchObject({ status: "error", message: expect.stringMatching(/Revoke one/) });
    expect(limit).not.toHaveProperty("field");
  });

  it("revokes only the session user's own token", async () => {
    const owner = await createTestUser();
    const other = await createTestUser();
    const { record } = await createConnectorToken(owner.id, "Muse", "write");

    getSessionUserId.mockResolvedValue(other.id);
    expect(await revokeConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ tokenId: record.id }))).toMatchObject({
      status: "error",
      message: "We couldn't find that connection.",
    });
    getSessionUserId.mockResolvedValue(owner.id);
    expect(await revokeConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ tokenId: record.id }))).toMatchObject({ status: "success" });
    expect((await db.connectorToken.findUniqueOrThrow({ where: { id: record.id } })).revokedAt).not.toBeNull();
  });

  it("hides unexpected failures behind a friendly message and logs them", async () => {
    const user = await createTestUser();
    getSessionUserId.mockResolvedValue(user.id);
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // The count and insert run in one transaction; fail it the way a full disk would.
    const create = vi.spyOn(db, "$transaction").mockRejectedValueOnce(new Error("disk full"));
    expect(await createConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ name: "Muse", scope: "read" }))).toMatchObject({
      status: "error",
      message: "We couldn't create that connection. Try again in a moment.",
    });
    create.mockRestore();
    const update = vi.spyOn(db.connectorToken, "findFirst").mockRejectedValueOnce("boom");
    expect(await revokeConnectorTokenAction(IDLE_CONNECTOR_STATE, form({ tokenId: "tok_1" }))).toMatchObject({
      status: "error",
      message: "We couldn't revoke that connection. Try again in a moment.",
    });
    update.mockRestore();
    expect(logged).toHaveBeenCalledWith("[settings] connector action failed", expect.objectContaining({ action: "create", error: "disk full" }));
    expect(logged).toHaveBeenCalledWith("[settings] connector action failed", expect.objectContaining({ action: "revoke", error: "boom" }));
    logged.mockRestore();
  });
});
