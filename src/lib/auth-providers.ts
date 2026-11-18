// Which OAuth sign-in options are configured. A provider is offered only when both its client id and secret
// are set (the env names Auth.js reads on its own: AUTH_GOOGLE_ID / AUTH_GOOGLE_SECRET, AUTH_FACEBOOK_ID / ...).

export const OAUTH_PROVIDERS = ["google", "facebook"] as const;
export type OAuthProviderId = (typeof OAUTH_PROVIDERS)[number];

export const OAUTH_LABEL: Readonly<Record<OAuthProviderId, string>> = { google: "Google", facebook: "Meta" };

const ENV_PREFIX: Readonly<Record<OAuthProviderId, string>> = { google: "AUTH_GOOGLE", facebook: "AUTH_FACEBOOK" };

type Env = Readonly<Record<string, string | undefined>>;

export function isOAuthProvider(value: unknown): value is OAuthProviderId {
  return typeof value === "string" && (OAUTH_PROVIDERS as readonly string[]).includes(value);
}

export function isProviderConfigured(provider: OAuthProviderId, env: Env = process.env): boolean {
  const prefix = ENV_PREFIX[provider];
  return Boolean(env[`${prefix}_ID`]?.trim() && env[`${prefix}_SECRET`]?.trim());
}

export function configuredOAuthProviders(env: Env = process.env): OAuthProviderId[] {
  return OAUTH_PROVIDERS.filter((provider) => isProviderConfigured(provider, env));
}
