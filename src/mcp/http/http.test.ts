import { afterEach, describe, expect, it, vi } from "vitest";
import { appOrigin, mcpEndpoint, resourceMetadataUrl } from "./config";
import { createMcpHandler, originAllowed } from "./handler";
import { protectedResourceMetadata } from "./metadata";
import { createRateLimiter, FAILED_AUTH_RATE_LIMIT, MCP_RATE_LIMIT } from "./rate-limit";
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

describe("createRateLimiter default clock", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("reads Date.now at call time, so a frozen clock holds even for a limiter created earlier", () => {
    const limiter = createRateLimiter({ capacity: 1, windowMs: 1000 });
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-08T12:00:00Z"));
    expect(limiter.take("a").allowed).toBe(true);
    expect(limiter.take("a").allowed).toBe(false);
    vi.setSystemTime(new Date("2026-11-08T12:00:01Z"));
    expect(limiter.take("a").allowed).toBe(true);
  });
});

describe("createMcpHandler failed-token limit", () => {
  const goodToken = { tokenId: "t1", userId: "u1", scope: "read" as const };
  // Well-formed tokens (inr_ + 43 base64url characters); only "good" verifies.
  const wellFormed = (fill: string) => `Bearer inr_${fill.repeat(43)}`;
  const GOOD = wellFormed("g");
  const handlerWith = (capacity: number) =>
    createMcpHandler({
      origin: () => "https://a.test",
      verify: async (header) => (header === GOOD ? goodToken : null),
      failedAuthLimiter: createRateLimiter({ capacity, windowMs: 60_000, now: () => 0 }),
    });
  const request = (authorization?: string) =>
    new Request("https://a.test/mcp", { method: "GET", headers: authorization ? { Authorization: authorization } : {} });

  it("answers 429 with Retry-After once too many well-formed tokens fail verification, from any client", async () => {
    const handle = handlerWith(2);
    expect((await handle(request(wellFormed("a")))).status).toBe(401);
    expect((await handle(request(wellFormed("b")))).status).toBe(401);
    const limited = await handle(request(wellFormed("c")));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThanOrEqual(1);
  });

  it("always answers a missing or malformed Authorization header with the 401 challenge, without draining the bucket", async () => {
    const handle = handlerWith(1);
    for (const authorization of [undefined, "Bearer bad", "Basic abc", "Bearer inr_short", "Bearer"]) {
      const response = await handle(request(authorization));
      expect(response.status).toBe(401);
      expect(response.headers.get("www-authenticate")).toContain("resource_metadata=");
    }
    expect((await handle(request(wellFormed("a")))).status).toBe(401);
    expect((await handle(request(wellFormed("b")))).status).toBe(429);
    expect((await handle(request())).status).toBe(401);
  });

  it("never limits a request whose token verifies", async () => {
    const handle = handlerWith(1);
    await handle(request(wellFormed("a")));
    expect((await handle(request(wellFormed("a")))).status).toBe(429);
    expect((await handle(request(GOOD))).status).toBe(405);
  });

  it("gives failed tokens a larger, shared budget than one token gets", () => {
    expect(FAILED_AUTH_RATE_LIMIT.capacity).toBeGreaterThan(MCP_RATE_LIMIT.capacity);
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
