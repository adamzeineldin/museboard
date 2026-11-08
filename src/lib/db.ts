import "server-only";
import type { PrismaClient } from "@/generated/prisma/client";
import { createPrismaClient } from "./prisma-client";

// One Prisma client per process. In dev, Next.js hot reload re-evaluates modules,
// so the instance is cached on globalThis to avoid exhausting SQLite handles.
const globalForPrisma = globalThis as typeof globalThis & { __inroadPrisma?: PrismaClient };

export const db: PrismaClient = globalForPrisma.__inroadPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.__inroadPrisma = db;
}
