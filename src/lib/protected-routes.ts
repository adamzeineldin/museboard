// Paths that need a signed-in user. The proxy does a cheap cookie check; pages still call
// requireUser()/auth() for the real check.
export const PROTECTED_PREFIXES = ["/jobs", "/campaign", "/activity", "/warm-paths", "/settings", "/onboarding"] as const;

/**
 * Always public, even if a protected prefix is added later: the weekly digest's one-click links
 * (/pause, /digest/unsubscribe). Their signed token authorises exactly one action, so no session is needed.
 */
export const PUBLIC_TOKEN_PREFIXES = ["/pause", "/digest"] as const;

export const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

const matchesPrefix = (pathname: string, prefix: string): boolean => pathname === prefix || pathname.startsWith(`${prefix}/`);

export function isProtectedPath(pathname: string): boolean {
  if (PUBLIC_TOKEN_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix))) return false;
  return PROTECTED_PREFIXES.some((prefix) => matchesPrefix(pathname, prefix));
}

/** Only allow same-site relative paths as post-sign-in destinations. */
export function safeCallbackPath(value: string | null | undefined, fallback = "/jobs"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
