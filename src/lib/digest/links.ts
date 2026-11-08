import type { DigestLinkConfig } from "./config";
import { signLinkToken } from "./tokens";
import type { DigestLinks } from "./types";

// Absolute URLs for the digest email. Pause/unsubscribe carry a signed, expiring token that authorises
// exactly one thing; both pages ask for a click (POST) before changing anything.

export const PAUSE_PATH = "/pause";
export const UNSUBSCRIBE_PATH = "/digest/unsubscribe";

export interface DigestLinkInput {
  userId: string;
  /** The live campaign to pause, or null for no pause link. */
  pauseCampaignId: string | null;
}

const withToken = (base: string, path: string, token: string): string => `${base}${path}?token=${encodeURIComponent(token)}`;

export function buildDigestLinks(input: DigestLinkInput, config: DigestLinkConfig, now: Date): DigestLinks {
  const { baseUrl, secret } = config;
  const pause = input.pauseCampaignId
    ? withToken(baseUrl, PAUSE_PATH, signLinkToken({ purpose: "pause", userId: input.userId, campaignId: input.pauseCampaignId }, secret, now))
    : null;
  return {
    activity: `${baseUrl}/activity`,
    campaign: `${baseUrl}/campaign`,
    warmPaths: `${baseUrl}/warm-paths`,
    pause,
    unsubscribe: withToken(baseUrl, UNSUBSCRIBE_PATH, signLinkToken({ purpose: "unsubscribe", userId: input.userId }, secret, now)),
  };
}
