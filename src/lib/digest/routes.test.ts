import { describe, expect, it } from "vitest";
import { isProtectedPath, PUBLIC_TOKEN_PREFIXES } from "@/lib/protected-routes";
import { PAUSE_PATH, UNSUBSCRIBE_PATH } from "./links";

// The digest's one-click links must open while signed out (src/proxy.ts redirects protected paths).
describe("digest link routes", () => {
  it.each([PAUSE_PATH, UNSUBSCRIBE_PATH])("%s is reachable without a session", (path) => {
    expect(isProtectedPath(path)).toBe(false);
    expect(PUBLIC_TOKEN_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))).toBe(true);
  });

  it("leaves the signed-in pages protected", () => {
    expect(isProtectedPath("/settings")).toBe(true);
    expect(isProtectedPath("/campaign")).toBe(true);
  });
});
