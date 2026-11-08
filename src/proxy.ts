import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES, isProtectedPath } from "@/lib/protected-routes";

// Optimistic check only: no session cookie means "go sign in". The (app) layout and every server
// action still verify the session against the database via auth().
export function proxy(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;
  if (!isProtectedPath(pathname)) return NextResponse.next();

  const hasSessionCookie = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  if (hasSessionCookie) return NextResponse.next();

  const signInUrl = new URL("/signin", request.url);
  signInUrl.searchParams.set("callbackUrl", `${pathname}${search}`);
  return NextResponse.redirect(signInUrl);
}

export const config = {
  matcher: ["/jobs/:path*", "/campaign/:path*", "/activity/:path*", "/warm-paths/:path*", "/settings/:path*", "/onboarding/:path*"],
};
