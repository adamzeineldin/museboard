import { describe, expect, it } from "vitest";
import { appBaseUrl, DEFAULT_DIGEST_FROM, DigestConfigError, digestMailConfig, linkSecret } from "./config";

const env = (values: Record<string, string>) => values as unknown as NodeJS.ProcessEnv;

describe("digest config", () => {
  it("requires a long enough AUTH_SECRET and never echoes it", () => {
    expect(() => linkSecret(env({}))).toThrow(DigestConfigError);
    expect(() => linkSecret(env({ AUTH_SECRET: "short-secret" }))).toThrow(/AUTH_SECRET must be set/);
    try {
      linkSecret(env({ AUTH_SECRET: "short-secret" }));
    } catch (error) {
      expect(String(error)).not.toContain("short-secret");
    }
    expect(linkSecret(env({ AUTH_SECRET: " 0123456789abcdef " }))).toBe("0123456789abcdef");
  });

  it("uses APP_URL, then AUTH_URL, then localhost outside production", () => {
    expect(appBaseUrl(env({ APP_URL: "https://inroad.example/", AUTH_URL: "https://auth.example" }))).toBe("https://inroad.example");
    expect(appBaseUrl(env({ AUTH_URL: "https://auth.example" }))).toBe("https://auth.example");
    expect(appBaseUrl(env({ NODE_ENV: "development" }))).toBe("http://localhost:3000");
    expect(() => appBaseUrl(env({ NODE_ENV: "production" }))).toThrow(/APP_URL/);
    expect(() => appBaseUrl(env({ APP_URL: "javascript:alert(1)" }))).toThrow(/http/);
  });

  it("reads mail settings with a default sender", () => {
    expect(digestMailConfig(env({}))).toEqual({ from: DEFAULT_DIGEST_FROM, emailServer: undefined });
    expect(digestMailConfig(env({ EMAIL_FROM: "A <a@b.test>", EMAIL_SERVER: "smtp://s" }))).toEqual({ from: "A <a@b.test>", emailServer: "smtp://s" });
  });
});
