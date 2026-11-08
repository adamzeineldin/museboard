import "server-only";
import { db } from "@/lib/db";
import { isoWeekRange } from "@/lib/rules";
import type { DbClient } from "./client";

/**
 * Applications committed to go out in the ISO week containing `now` (Monday 00:00 in `timeZone`):
 * submitted (by submittedAt) plus prepared (by decidedAt). See docs/ARCHITECTURE.md "weekCount".
 */
export async function countWeek(
  client: DbClient,
  userId: string,
  now: Date,
  timeZone: string,
  excludeApplicationId?: string,
): Promise<number> {
  const { start, end } = isoWeekRange(now, timeZone);
  const inWeek = { gte: start, lt: end };
  return client.application.count({
    where: {
      userId,
      ...(excludeApplicationId ? { id: { not: excludeApplicationId } } : {}),
      OR: [
        { status: "submitted", submittedAt: inWeek },
        { status: "prepared", decidedAt: inWeek },
      ],
    },
  });
}

export async function weekCount(
  userId: string,
  now: Date,
  timeZone: string,
  excludeApplicationId?: string,
): Promise<number> {
  return countWeek(db, userId, now, timeZone, excludeApplicationId);
}
