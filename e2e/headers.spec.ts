import { expect, test } from "@playwright/test";

// Security response headers from next.config.ts: pages cannot be framed and carry a CSP without
// script-src; the Muse connector endpoints (/mcp, /.well-known) keep their own headers.

const FRAME_CSP = "frame-ancestors 'none'";

test.describe("security headers", () => {
  for (const path of ["/signin", "/pause?token=not-a-real-token"]) {
    test(`${path} cannot be framed and does not advertise Next.js`, async ({ request }) => {
      const response = await request.get(path, { maxRedirects: 0 });
      const headers = response.headers();
      expect(headers["x-frame-options"]).toBe("DENY");
      expect(headers["content-security-policy"]).toContain(FRAME_CSP);
      expect(headers["content-security-policy"]).toContain("form-action 'self'");
      expect(headers["content-security-policy"]).not.toContain("script-src");
      expect(headers["x-content-type-options"]).toBe("nosniff");
      expect(headers["referrer-policy"]).toBeTruthy();
      expect(headers["x-powered-by"]).toBeUndefined();
    });
  }

  test("the MCP discovery document is not given the page framing headers", async ({ request }) => {
    const response = await request.get("/.well-known/oauth-protected-resource");
    const headers = response.headers();
    expect(headers["x-frame-options"]).toBeUndefined();
    expect(headers["content-security-policy"] ?? "").not.toContain(FRAME_CSP);
    expect(headers["x-content-type-options"]).toBe("nosniff");
  });
});
