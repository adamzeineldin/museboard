import "server-only";
import { PrismaAdapter } from "@auth/prisma-adapter";
import type { Adapter } from "next-auth/adapters";
import type { PrismaClient } from "@/generated/prisma/client";

type AdapterClient = Pick<PrismaClient, "session">;

/**
 * The Prisma adapter, except that deleting a session that no longer exists is not an error.
 * Auth.js deletes the browser's current session before a new magic-link sign-in and on sign-out. If that row is
 * already gone (expired and cleaned up, signed out elsewhere, reset database), the stock adapter throws
 * P2025 and the user sees "Sign-in isn't configured correctly" with no way back in.
 */
export function createAuthAdapter(client: AdapterClient): Adapter {
  const base = PrismaAdapter(client as unknown as Parameters<typeof PrismaAdapter>[0]);
  return {
    ...base,
    async deleteSession(sessionToken) {
      await client.session.deleteMany({ where: { sessionToken } });
      return null;
    },
  };
}
