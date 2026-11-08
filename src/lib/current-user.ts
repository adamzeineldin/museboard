import "server-only";
import { redirect } from "next/navigation";
import type { User } from "@/generated/prisma/client";
import { auth } from "./auth";
import { db } from "./db";

/** The signed-in user's id, or null. Use in route handlers / actions that must not redirect. */
export async function getSessionUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}

/** The signed-in user from the database. Redirects to /signin when there is no valid session. */
export async function requireUser(): Promise<User> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/signin");
  const user = await db.user.findUnique({ where: { id: userId } });
  if (!user) redirect("/signin");
  return user;
}
