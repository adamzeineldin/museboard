// Muse connector token settings. Pure constants, safe to import from client components.

export const TOKEN_PREFIX = "inr_";
export const TOKEN_RANDOM_BYTES = 32;
/** How often lastUsedAt may be written for one token. */
export const LAST_USED_RESOLUTION_MS = 60_000;
export const TOKEN_NAME_MAX = 60;
export const MAX_ACTIVE_TOKENS = 10;

/** OAuth-style scope names advertised in /.well-known/oauth-protected-resource. */
export const OAUTH_SCOPES = { read: "inroad.read", write: "inroad.write" } as const;

export const SCOPE_LABELS = { read: "Read only", write: "Read and write" } as const;
