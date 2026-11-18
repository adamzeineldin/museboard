import type { ChipTone } from "@/components/ui";

/**
 * Whether Muse is really talking to Inroad. "connected" needs an unrevoked token that Muse has used;
 * a token that exists but was never used reads "unused", so a mis-pasted token is not shown as working.
 */
export type MuseConnection = "connected" | "unused" | "none";

export interface MuseTokenCounts {
  /** Unrevoked tokens. */
  active: number;
  /** Unrevoked tokens with a lastUsedAt. */
  used: number;
}

export function museConnectionState({ active, used }: MuseTokenCounts): MuseConnection {
  if (used > 0) return "connected";
  return active > 0 ? "unused" : "none";
}

const DEFAULT_SUBTITLE = "Your agent, using Inroad";

/** Chip labels stay short so the panel header fits a 320px screen; the subtitle carries any explanation. */
export const MUSE_CONNECTION_CHIP: Readonly<Record<MuseConnection, { tone: ChipTone; label: string; subtitle: string }>> = {
  connected: { tone: "ok", label: "Connected", subtitle: DEFAULT_SUBTITLE },
  unused: { tone: "neutral", label: "Not used yet", subtitle: "You created a token. Muse hasn't used it yet." },
  none: { tone: "neutral", label: "Not connected", subtitle: DEFAULT_SUBTITLE },
};

/** The first line of the sidebar status card. */
export const MUSE_STATUS_LINE: Readonly<Record<MuseConnection, { tone: "live" | "neutral"; label: string }>> = {
  connected: { tone: "live", label: "Muse connected" },
  unused: { tone: "neutral", label: "Muse not used yet" },
  none: { tone: "neutral", label: "Muse not connected" },
};
