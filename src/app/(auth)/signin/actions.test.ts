import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAGIC_LINK_LIMITS } from "@/lib/auth-rate-limit";

// Where Auth.js sends the browser after a real send; a limited request takes the same hop.
const VERIFY_REQUEST = "/api/auth/verify-request?provider=nodemailer&type=email";

const { signIn, headers, redirect, AuthError } = vi.hoisted(() => ({
  AuthError: class AuthError extends Error {},
  signIn: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
// next-auth's ESM build cannot resolve next/server under vitest, so stand in for the one export the action uses.
vi.mock("next-auth", () => ({ AuthError }));
vi.mock("@/lib/auth", () => ({ signIn }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) throw error;
  },
}));

const { requestMagicLink, signInWithProvider } = await import("./actions");

const EMPTY = { error: null, email: "" };

const form = (email: string): FormData => {
  const data = new FormData();
  data.append("email", email);
  data.append("callbackUrl", "/jobs");
  return data;
};

const fromIp = (ip: string | null): void => {
  headers.mockResolvedValue(new Headers(ip ? { "x-forwarded-for": `${ip}, 10.0.0.1` } : {}));
};

describe("requestMagicLink", () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    signIn.mockImplementation(async () => {
      throw new Error(`NEXT_REDIRECT:${VERIFY_REQUEST}`);
    });
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warn.mockRestore();
  });

  it("rejects an invalid address without calling Auth.js", async () => {
    fromIp("192.0.2.1");
    await expect(requestMagicLink(EMPTY, form("not-an-email"))).resolves.toMatchObject({ error: "Enter a valid email address." });
    expect(signIn).not.toHaveBeenCalled();
  });

  it("asks Auth.js to send the link to the normalised address", async () => {
    fromIp("192.0.2.2");
    await expect(requestMagicLink(EMPTY, form(" Jordan@School.edu "))).rejects.toThrow(`NEXT_REDIRECT:${VERIFY_REQUEST}`);
    expect(signIn).toHaveBeenCalledWith("nodemailer", { email: "jordan@school.edu", redirectTo: "/jobs" });
  });

  it("stops one client before Auth.js once it passes its limit, and still redirects as a real send does", async () => {
    fromIp("192.0.2.3");
    const capacity = MAGIC_LINK_LIMITS.perClient.capacity;
    for (let i = 0; i < capacity; i += 1) {
      await expect(requestMagicLink(EMPTY, form(`spray${i}@school.edu`))).rejects.toThrow("NEXT_REDIRECT");
    }
    await expect(requestMagicLink(EMPTY, form("one-more@school.edu"))).rejects.toThrow(`NEXT_REDIRECT:${VERIFY_REQUEST}`);
    expect(signIn).toHaveBeenCalledTimes(capacity);
    expect(redirect).toHaveBeenCalledWith(VERIFY_REQUEST);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("per-client");
    expect(message).not.toContain("one-more@school.edu");
  });

  it("stops repeat requests for one address before Auth.js, from any client", async () => {
    const capacity = MAGIC_LINK_LIMITS.perEmail.capacity;
    for (let i = 0; i < capacity; i += 1) {
      fromIp(`198.51.100.${i + 1}`);
      await expect(requestMagicLink(EMPTY, form("victim@school.edu"))).rejects.toThrow("NEXT_REDIRECT");
    }
    fromIp("198.51.100.99");
    await expect(requestMagicLink(EMPTY, form("victim@school.edu"))).rejects.toThrow(`NEXT_REDIRECT:${VERIFY_REQUEST}`);
    expect(signIn).toHaveBeenCalledTimes(capacity);
    const message = String(warn.mock.calls[0]?.[0]);
    expect(message).toContain("per-email");
    expect(message).not.toContain("victim@school.edu");
  });

  it("does not let one client's limit block a different client", async () => {
    fromIp("192.0.2.4");
    for (let i = 0; i <= MAGIC_LINK_LIMITS.perClient.capacity; i += 1) {
      await expect(requestMagicLink(EMPTY, form(`flood${i}@school.edu`))).rejects.toThrow("NEXT_REDIRECT");
    }
    signIn.mockClear();
    fromIp("192.0.2.5");
    await expect(requestMagicLink(EMPTY, form("bystander@school.edu"))).rejects.toThrow("NEXT_REDIRECT");
    expect(signIn).toHaveBeenCalledTimes(1);
  });

  it("groups requests without a forwarded address under one unknown client", async () => {
    fromIp(null);
    for (let i = 0; i < MAGIC_LINK_LIMITS.perClient.capacity; i += 1) {
      await expect(requestMagicLink(EMPTY, form(`anon${i}@school.edu`))).rejects.toThrow("NEXT_REDIRECT");
    }
    await expect(requestMagicLink(EMPTY, form("anon-last@school.edu"))).rejects.toThrow(`NEXT_REDIRECT:${VERIFY_REQUEST}`);
    expect(signIn).toHaveBeenCalledTimes(MAGIC_LINK_LIMITS.perClient.capacity);
  });

  it("shows a retry message when Auth.js fails to send", async () => {
    fromIp("192.0.2.6");
    signIn.mockRejectedValueOnce(new AuthError("smtp down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    try {
      await expect(requestMagicLink(EMPTY, form("a@school.edu"))).resolves.toMatchObject({
        error: "We couldn't send your sign-in link. Try again in a minute.",
        email: "a@school.edu",
      });
    } finally {
      error.mockRestore();
    }
  });
});

describe("signInWithProvider", () => {
  const providerForm = (provider: string, callbackUrl = "/activity"): FormData => {
    const data = new FormData();
    data.append("provider", provider);
    data.append("callbackUrl", callbackUrl);
    return data;
  };

  beforeEach(() => {
    signIn.mockReset();
    vi.unstubAllEnvs();
  });
  afterEach(() => vi.unstubAllEnvs());

  it("starts the provider's sign-in with a safe callback when it is configured", async () => {
    vi.stubEnv("AUTH_GOOGLE_ID", "id");
    vi.stubEnv("AUTH_GOOGLE_SECRET", "secret");
    await signInWithProvider(providerForm("google", "https://evil.example/x"));
    expect(signIn).toHaveBeenCalledWith("google", { redirectTo: "/jobs" });
  });

  it("explains instead of redirecting when the provider has no credentials", async () => {
    vi.stubEnv("AUTH_FACEBOOK_ID", "");
    await expect(signInWithProvider(providerForm("facebook"))).rejects.toThrow("NEXT_REDIRECT:/signin?error=ProviderNotConfigured&provider=facebook");
    expect(signIn).not.toHaveBeenCalled();
  });

  it("ignores unknown providers", async () => {
    await expect(signInWithProvider(providerForm("github"))).rejects.toThrow("NEXT_REDIRECT:/signin");
    expect(signIn).not.toHaveBeenCalled();
  });
});
