import { beforeEach, describe, expect, it, vi } from "vitest";
import { IDLE_CONNECTOR_STATE } from "@/components/connector/view-model";
import { createTestUser, db, resetDb } from "@/test/db";
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
});
