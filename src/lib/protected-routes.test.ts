import { describe, expect, it } from "vitest";
import { isProtectedPath, safeCallbackPath } from "./protected-routes";

describe("isProtectedPath", () => {
  it.each(["/jobs", "/jobs/abc", "/campaign", "/activity", "/warm-paths", "/settings", "/onboarding"])("protects %s", (p) => {
    expect(isProtectedPath(p)).toBe(true);
  });
  it.each(["/", "/signin", "/signin/check-email", "/api/auth/session", "/mcp", "/jobsearch"])("leaves %s public", (p) => {
    expect(isProtectedPath(p)).toBe(false);
  });
});

describe("safeCallbackPath", () => {
  it("keeps relative app paths", () => {
    expect(safeCallbackPath("/campaign?x=1")).toBe("/campaign?x=1");
  });
  it.each([null, "", "https://evil.test", "//evil.test", "/\\evil.test", "jobs"])("falls back for %s", (v) => {
    expect(safeCallbackPath(v)).toBe("/jobs");
  });
});
