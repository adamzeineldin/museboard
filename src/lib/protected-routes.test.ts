import { describe, expect, it } from "vitest";
import { isProtectedPath, safeCallbackPath } from "./protected-routes";

describe("isProtectedPath", () => {
  it.each(["/jobs", "/jobs/abc", "/campaign", "/activity", "/warm-paths", "/settings", "/onboarding"])("protects %s", (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });
  it.each(["/", "/signin", "/signin/check-email", "/api/auth/session", "/mcp", "/.well-known/oauth-protected-resource", "/jobsearch"])("leaves %s public", (p) => {
    expect(isProtectedPath(p)).toBe(false);
  });
});

describe("safeCallbackPath", () => {
  it("keeps relative app paths", () => {
    expect(safeCallbackPath("/campaign?x=1")).toBe("/campaign?x=1");
  });
  it("keeps the hash and normalises dot segments without leaving the site", () => {
    expect(safeCallbackPath("/activity#ready")).toBe("/activity#ready");
    expect(safeCallbackPath("/jobs/../campaign")).toBe("/campaign");
  });
  it.each([null, "", "https://evil.test", "//evil.test", "/\\evil.test", "jobs"])("falls back for %s", (v) => {
    expect(safeCallbackPath(v)).toBe("/jobs");
  });
  // Browsers strip tab/newline from URLs, so "/\t/evil" is read as "//evil" (another origin).
  it.each(["/\t/evil.example", "/\n/evil.example", "/\r/evil.example", decodeURIComponent("/%09/evil.example"), "/\u0000x", "/a\\b"])(
    "falls back for control characters and backslashes: %j",
    (v) => {
      expect(safeCallbackPath(v)).toBe("/jobs");
    },
  );
});
