import { z } from "zod";

// Public base URL of the app, used for the protected-resource metadata, WWW-Authenticate and the Origin check.

const DEV_FALLBACK = "http://localhost:3000";
const urlSchema = z.url({ protocol: /^https?$/ });

/** The app's origin (scheme://host[:port]) from APP_URL, then AUTH_URL; localhost outside production. */
export function appOrigin(env: NodeJS.ProcessEnv = process.env): string {
  for (const candidate of [env.APP_URL, env.AUTH_URL]) {
    const parsed = urlSchema.safeParse(candidate?.trim());
    if (parsed.success) return new URL(parsed.data).origin;
  }
  if (env.NODE_ENV === "production") throw new Error("APP_URL must be set to the app's public URL (https://...).");
  return DEV_FALLBACK;
}

export const mcpEndpoint = (origin: string): string => `${origin}/mcp`;
export const resourceMetadataUrl = (origin: string): string => `${origin}/.well-known/oauth-protected-resource`;
