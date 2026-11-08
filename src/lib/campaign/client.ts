import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { ApprovedVia, Actor } from "@/lib/types";

/** The full client or the client inside an interactive transaction. */
export type DbClient = PrismaClient | Prisma.TransactionClient;

/** Campaign changes made through Muse are logged with actor 'muse'; web changes with actor 'user'. */
export const actorForVia = (via: ApprovedVia): Actor => (via === "muse" ? "muse" : "user");

export const LIVE_STATUSES = ["active", "paused"] as const;
