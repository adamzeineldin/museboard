import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { PROTECTED_PREFIXES, PUBLIC_TOKEN_PREFIXES, SESSION_COOKIE_NAMES } from "@/lib/protected-routes";
import { config, proxy } from "./proxy";

const ORIGIN = "http://localhost:3000";

function request(pathAndQuery: string, cookie?: string): NextRequest {
  return new NextRequest(`${ORIGIN}${pathAndQuery}`, cookie ? { headers: { cookie } } : undefined);
}

const isNext = (response: Response): boolean => response.headers.get("x-middleware-next") === "1";

describe("proxy matcher", () => {
  // Next needs a static matcher, so it cannot import PROTECTED_PREFIXES; this keeps the two lists in step.
  it("has exactly one entry per protected prefix", () => {
    expect([...config.matcher].sort()).toEqual(PROTECTED_PREFIXES.map((prefix) => `${prefix}/:path*`).sort());
  });

  it("never runs on the public one-click token pages", () => {
    for (const prefix of PUBLIC_TOKEN_PREFIXES) {
      expect(config.matcher.some((entry) => entry.startsWith(`${prefix}/`))).toBe(false);
    }
  });
});

describe("proxy", () => {
  it("sends a signed-out visitor to sign in and keeps the path and query as the callback", () => {
    const response = proxy(request("/campaign?x=1"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(`${ORIGIN}/signin?callbackUrl=%2Fcampaign%3Fx%3D1`);
  });

  it.each(SESSION_COOKIE_NAMES)("lets a visitor with a %s cookie through", (name) => {
    const response = proxy(request("/campaign?x=1", `${name}=abc`));
    expect(isNext(response)).toBe(true);
    expect(response.headers.get("location")).toBeNull();
  });

  it.each(["/pause?token=t", "/digest/unsubscribe?token=t", "/signin", "/"])("lets %s through without a session", (path) => {
    const response = proxy(request(path));
    expect(isNext(response)).toBe(true);
  });
});
