import "server-only";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { actorSchema, type Actor } from "@/lib/types";
import { ApplicationError } from "./errors";

export type DbClient = PrismaClient | Prisma.TransactionClient;

export function parseActorOrThrow(actor: unknown): Actor {
  const parsed = actorSchema.safeParse(actor);
  if (!parsed.success) throw new ApplicationError("invalid_input", "Unknown actor.");
  return parsed.data;
}

export function parseIdOrThrow(id: unknown, what: string): string {
  if (typeof id !== "string" || !id.trim() || id.length > 200) {
    throw new ApplicationError("not_found", `We couldn't find that ${what}.`);
  }
  return id;
}

export const roleLabel = (company: string, title: string): string => `${company} · ${title}`;

export function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && (error as { code?: unknown }).code === "P2002");
}

export const errorMessage = (error: unknown): string => (error instanceof Error ? error.message : String(error));
