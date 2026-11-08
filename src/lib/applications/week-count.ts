import "server-only";
import type { Application, Prisma } from "@/generated/prisma/client";
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

export type RankedApplication = Pick<Application, "id" | "decidedAt" | "createdAt">;

/** Campaign-prepared rows decided this week strictly before `app` (decidedAt, then createdAt, then id). */
function campaignRowsAhead(app: RankedApplication & { decidedAt: Date }, inWeek: { gte: Date; lt: Date }): Prisma.ApplicationWhereInput {
  const decided = app.decidedAt;
  return {
    status: "prepared",
    decidedBy: { not: "user" },
    AND: [
      { decidedAt: inWeek },
      {
        OR: [
          { decidedAt: { lt: decided } },
          { decidedAt: decided, createdAt: { lt: app.createdAt } },
          { decidedAt: decided, createdAt: app.createdAt, id: { lt: app.id } },
        ],
      },
    ],
  };
}

/**
 * The weekly count a campaign-prepared application is re-checked against at release time
 * (docs/ARCHITECTURE.md "weekCount"): this week's submitted rows, every row the user approved this week,
 * and the campaign-prepared rows decided this week before it. A user approval therefore pushes the
 * newest campaign-prepared rows over the cap, never the older ones. A row prepared in an earlier week
 * goes last: it is checked against everything committed this week (excluding itself).
 */
export async function countAhead(
  client: DbClient,
  userId: string,
  app: RankedApplication,
  now: Date,
  timeZone: string,
): Promise<number> {
  const { start, end } = isoWeekRange(now, timeZone);
  const inWeek = { gte: start, lt: end };
  const decidedAt = app.decidedAt;
  if (!decidedAt || decidedAt < start || decidedAt >= end) return countWeek(client, userId, now, timeZone, app.id);
  return client.application.count({
    where: {
      userId,
      id: { not: app.id },
      OR: [
        { status: "submitted", submittedAt: inWeek },
        { status: "prepared", decidedBy: "user", decidedAt: inWeek },
        campaignRowsAhead({ ...app, decidedAt }, inWeek),
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
