import { describe, expect, it } from "vitest";
import { appOrigin, mcpEndpoint, resourceMetadataUrl } from "./config";
import { originAllowed } from "./handler";
import { protectedResourceMetadata } from "./metadata";
import { createRateLimiter } from "./rate-limit";
import { methodNotAllowed, tooManyRequests, unauthorized } from "./responses";

describe("appOrigin", () => {
  it("prefers APP_URL, then AUTH_URL, and keeps only the origin", () => {
    expect(appOrigin({ APP_URL: "https://inroad.example/app/", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe("https://inroad.example");
    expect(appOrigin({ APP_URL: "not a url", AUTH_URL: "http://localhost:4000", NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBe("http://localhost:4000");
  });

  it("falls back to localhost outside production and fails loudly in production", () => {
    expect(appOrigin({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe("http://localhost:3000");
    expect(() => appOrigin({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/APP_URL/);
    expect(() => appOrigin({ APP_URL: "javascript:alert(1)", NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrow(/APP_URL/);
  });

  it("builds the endpoint and metadata URLs", () => {
    expect(mcpEndpoint("https://a.test")).toBe("https://a.test/mcp");
    expect(resourceMetadataUrl("https://a.test")).toBe("https://a.test/.well-known/oauth-protected-resource");
  });
});

describe("originAllowed", () => {
  it.each([
    [null, true],
    ["https://inroad.test", true],
    ["https://inroad.test/", true],
    ["https://evil.test", false],
    ["http://inroad.test", false],
    ["https://inroad.test.evil.test", false],
    ["null", false],
    ["", false],
  ])("Origin %s -> %s", (origin, allowed) => {
    expect(originAllowed(origin, "https://inroad.test")).toBe(allowed);
  });
});

describe("createRateLimiter", () => {
  it("allows a burst up to capacity, then refills over the window", () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 3, windowMs: 3000, now: () => now });
    expect([1, 2, 3].map(() => limiter.take("a").allowed)).toEqual([true, true, true]);
    expect(limiter.take("a")).toEqual({ allowed: false, retryAfterSeconds: 1 });
    expect(limiter.take("b").allowed).toBe(true);
    now = 1000;
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
  });

  it("reports how long to wait and bounds memory", () => {
    let now = 0;
    const limiter = createRateLimiter({ capacity: 60, windowMs: 60_000, maxKeys: 2, now: () => now });
    for (let i = 0; i < 60; i += 1) limiter.take("a");
    expect(limiter.take("a").retryAfterSeconds).toBe(1);
    limiter.take("b");
    limiter.take("c"); // evicts "a", the least recently used
    now = 1;
    expect(limiter.take("a").allowed).toBe(true);
  });
});

describe("responses", () => {
  it("401 carries the resource metadata challenge, with invalid_token only when credentials were sent", () => {
    expect(unauthorized("https://a.test", false).headers.get("www-authenticate")).toBe(
      'Bearer resource_metadata="https://a.test/.well-known/oauth-protected-resource"',
    );
    expect(unauthorized("https://a.test", true).headers.get("www-authenticate")).toContain('error="invalid_token"');
  });

  it("429 and 405 carry Retry-After and Allow", async () => {
    const limited = tooManyRequests(7);
    expect(limited.status).toBe(429);
    expect(limited.headers.get("retry-after")).toBe("7");
    expect(await limited.json()).toMatchObject({ jsonrpc: "2.0", error: { code: -32000 } });
    expect(methodNotAllowed().headers.get("allow")).toBe("POST");
  });
});

describe("protectedResourceMetadata", () => {
  it("describes /mcp per RFC 9728", () => {
    expect(protectedResourceMetadata("https://a.test")).toEqual({
      resource: "https://a.test/mcp",
      resource_name: "Inroad",
      scopes_supported: ["inroad.read", "inroad.write"],
      bearer_methods_supported: ["header"],
      authorization_servers: [],
    });
  });
});
