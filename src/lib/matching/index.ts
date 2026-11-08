import "server-only";
import { notImplemented } from "@/lib/not-implemented";

// Contract: docs/ARCHITECTURE.md "Cross-module function contract". Implemented in milestone 4.

/** Recompute Match rows for a user against open jobs. Returns the number of matches written. */
export async function recomputeMatches(userId: string): Promise<number> {
  return notImplemented("recomputeMatches", userId);
}
