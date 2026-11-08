import { db } from "./db";

// Auth.js only deletes a sign-in link's VerificationToken when the link is used. Links that are never
// clicked stay in the table, so the worker calls this after each pass.

/** Deletes the magic-link tokens that expired before `now` and returns how many were removed. */
export async function deleteExpiredVerificationTokens(now: Date): Promise<number> {
  const { count } = await db.verificationToken.deleteMany({ where: { expires: { lt: now } } });
  return count;
}
