import "server-only";
import { writeAudit } from "@/lib/audit";
import { db } from "@/lib/db";

export { MUSE_INSTRUCTIONS_MAX, museInstructionsSchema, type MuseInstructions } from "./schema";

export async function getMuseInstructions(userId: string): Promise<string | null> {
  const user = await db.user.findUnique({ where: { id: userId }, select: { museInstructions: true } });
  return user?.museInstructions ?? null;
}

/** Saves already-validated instructions and records the change (length only, never the text). */
export async function saveMuseInstructions(userId: string, instructions: string | null): Promise<string | null> {
  const updated = await db.user.update({ where: { id: userId }, data: { museInstructions: instructions }, select: { museInstructions: true } });
  await writeAudit(userId, "user", "muse_instructions.updated", { length: instructions?.length ?? 0 });
  return updated.museInstructions;
}
