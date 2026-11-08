import { beforeEach, describe, expect, it } from "vitest";
import { createTestUser, db, resetDb } from "@/test/db";
import { createAuthAdapter } from "./auth-adapter";

// A browser can hold a session cookie whose row is already gone (expired and cleaned up, signed out on another
// device, or a reset dev database). Auth.js deletes that session before signing the user in again, so the
// delete must not throw, or the magic link fails with "Configuration" and the user is locked out.

describe("createAuthAdapter", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("deleting a session that no longer exists succeeds quietly", async () => {
    const adapter = createAuthAdapter(db);
    await expect(adapter.deleteSession?.("missing-session-token")).resolves.toBeNull();
  });

  it("deletes an existing session and only that one", async () => {
    const user = await createTestUser();
    const expires = new Date(Date.now() + 60_000);
    await db.session.createMany({
      data: [
        { sessionToken: "keep", userId: user.id, expires },
        { sessionToken: "drop", userId: user.id, expires },
      ],
    });
    await createAuthAdapter(db).deleteSession?.("drop");
    expect((await db.session.findMany()).map((session) => session.sessionToken)).toEqual(["keep"]);
  });

  it("keeps the other Prisma adapter methods", async () => {
    const adapter = createAuthAdapter(db);
    expect(typeof adapter.createSession).toBe("function");
    expect(typeof adapter.getSessionAndUser).toBe("function");
    expect(typeof adapter.useVerificationToken).toBe("function");
  });
});
