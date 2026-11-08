// Pure: how the web shows the release check for a prepared application. The verdict itself comes from
// the applications service (getReleaseVerdicts), the same code getSubmissionPacket uses for Muse.

export interface ReleaseLike {
  allowed: boolean;
  reason: string;
}

export const RELEASE_UNAVAILABLE = "Release check unavailable";

/**
 * The reason a prepared application is held right now, or null when it may be released.
 * A missing verdict is treated as held: the web never claims a packet is ready without the check.
 */
export function heldReason(decidedBy: string, release: ReleaseLike | null | undefined): string | null {
  if (release) return release.allowed ? null : release.reason;
  return decidedBy === "user" ? null : RELEASE_UNAVAILABLE;
}

export const heldLabel = (reason: string): string => `Held: ${reason}`;
