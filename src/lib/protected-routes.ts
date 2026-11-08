// Paths that need a signed-in user. The proxy does a cheap cookie check; pages still call
// requireUser()/auth() for the real check.
export const PROTECTED_PREFIXES = ["/jobs", "/campaign", "/activity", "/warm-paths", "/settings", "/onboarding"] as const;

export const SESSION_COOKIE_NAMES = ["authjs.session-token", "__Secure-authjs.session-token"] as const;

export function isProtectedPath(pathname: string): boolean {
  return PROTECTED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/** Only allow same-site relative paths as post-sign-in destinations. */
export function safeCallbackPath(value: string | null | undefined, fallback = "/jobs"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
