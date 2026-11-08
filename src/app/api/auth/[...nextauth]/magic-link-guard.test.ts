import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createMagicLinkRequestGuard } from "@/lib/auth-rate-limit";
import { withMagicLinkGuard } from "./magic-link-guard";

const ORIGIN = "http://localhost:3000";
const SIGNIN_URL = `${ORIGIN}/api/auth/signin/nodemailer`;
const VERIFY_URL = `${ORIGIN}/api/auth/verify-request?provider=nodemailer&type=email`;
const ONE_PER_CLIENT = { perClient: { capacity: 1, windowMs: 60_000 }, perEmail: { capacity: 5, windowMs: 60_000 } };

const formPost = (email: string, ip = "192.0.2.1", headers: Record<string, string> = {}, url = SIGNIN_URL): Request =>
  new Request(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "x-forwarded-for": ip, ...headers },
    body: new URLSearchParams({ email, csrfToken: "token", callbackUrl: "/jobs" }).toString(),
  });

const jsonPost = (body: unknown, ip = "192.0.2.1"): Request =>
  new Request(SIGNIN_URL, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  });

describe("withMagicLinkGuard", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  const authjs = vi.fn(async (req: Request) => {
    await req.text();
    return new Response(null, { status: 302, headers: { Location: VERIFY_URL } });
  });

  beforeEach(() => {
    authjs.mockClear();
    vi.unstubAllEnvs();
    vi.stubEnv("AUTH_URL", "");
    vi.stubEnv("NEXTAUTH_URL", "");
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
    vi.unstubAllEnvs();
  });

  it("passes an allowed sign-in to Auth.js with the body still readable", async () => {
    const post = withMagicLinkGuard(authjs, createMagicLinkRequestGuard(ONE_PER_CLIENT));
    const res = await post(formPost("jordan@school.edu"));
    expect(authjs).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Location")).toBe(VERIFY_URL);
  });

  it("answers a limited sign-in with the verify-request redirect and never calls Auth.js", async () => {
    const post = withMagicLinkGuard(authjs, createMagicLinkRequestGuard(ONE_PER_CLIENT));
    await post(formPost("first@school.edu"));
    const res = await post(formPost("second@school.edu"));
    expect(authjs).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toBe(VERIFY_URL);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("per-client");
    expect(message).not.toContain("second@school.edu");
  });

  it("limits repeat requests for one address from many clients", async () => {
    const guard = createMagicLinkRequestGuard({ perEmail: { capacity: 1, windowMs: 60_000 } });
    const post = withMagicLinkGuard(authjs, guard);
    await post(jsonPost({ email: "victim@school.edu" }, "198.51.100.1"));
    const res = await post(jsonPost({ email: " Victim@School.edu " }, "198.51.100.2"));
    expect(authjs).toHaveBeenCalledTimes(1);
    expect(res.headers.get("Location")).toBe(VERIFY_URL);
    expect(String(warn.mock.calls[0]?.[0])).toContain("per-email");
  });

  it("counts address variants Auth.js sends to as one address (NFKC, comma-cut domain)", async () => {
    const guard = createMagicLinkRequestGuard({ perEmail: { capacity: 1, windowMs: 60_000 } });
    const post = withMagicLinkGuard(authjs, guard);
    await post(jsonPost({ email: "victim@school.edu" }, "198.51.100.1"));
    await post(jsonPost({ email: "victim@school.edu,x" }, "198.51.100.2"));
    await post(jsonPost({ email: "ｖｉｃｔｉｍ@school.edu" }, "198.51.100.3"));
    expect(authjs).toHaveBeenCalledTimes(1);
  });

  it("leaves addresses Auth.js rejects to Auth.js without counting them", async () => {
    const guard = createMagicLinkRequestGuard({ perEmail: { capacity: 1, windowMs: 60_000 } });
    const post = withMagicLinkGuard(authjs, guard);
    await post(jsonPost({ email: '"a"@school.edu' }));
    await post(jsonPost({ email: "a@b@school.edu" }));
    await post(jsonPost({ email: "victim@school.edu" }));
    expect(authjs).toHaveBeenCalledTimes(3);
  });

  it("returns the JSON form when the caller asks Auth.js to return the redirect", async () => {
    const post = withMagicLinkGuard(authjs, createMagicLinkRequestGuard(ONE_PER_CLIENT));
    await post(formPost("first@school.edu"));
    const res = await post(formPost("second@school.edu", "192.0.2.1", { "X-Auth-Return-Redirect": "1" }));
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ url: VERIFY_URL });
  });

  it("uses the AUTH_URL origin, as Auth.js does", async () => {
    vi.stubEnv("AUTH_URL", "https://inroad.example");
    const post = withMagicLinkGuard(authjs, createMagicLinkRequestGuard(ONE_PER_CLIENT));
    await post(formPost("first@school.edu"));
    const res = await post(formPost("second@school.edu"));
    expect(res.headers.get("Location")).toBe("https://inroad.example/api/auth/verify-request?provider=nodemailer&type=email");
  });

  it("leaves other auth routes untouched and uncounted", async () => {
    const guard = createMagicLinkRequestGuard(ONE_PER_CLIENT);
    const check = vi.spyOn(guard, "check");
    const post = withMagicLinkGuard(authjs, guard);
    await post(formPost("a@school.edu", "192.0.2.1", {}, `${ORIGIN}/api/auth/signout`));
    await post(formPost("a@school.edu", "192.0.2.1", {}, `${ORIGIN}/api/auth/callback/nodemailer`));
    expect(authjs).toHaveBeenCalledTimes(2);
    expect(check).not.toHaveBeenCalled();
  });

  it("passes a sign-in without an email through for Auth.js to reject", async () => {
    const guard = createMagicLinkRequestGuard(ONE_PER_CLIENT);
    const check = vi.spyOn(guard, "check");
    const post = withMagicLinkGuard(authjs, guard);
    await post(jsonPost({ csrfToken: "token" }));
    await post(new Request(SIGNIN_URL, { method: "POST", headers: { "content-type": "application/json" }, body: "{not json" }));
    expect(authjs).toHaveBeenCalledTimes(2);
    expect(check).not.toHaveBeenCalled();
  });
});
