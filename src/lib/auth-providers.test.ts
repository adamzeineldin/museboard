import { describe, expect, it } from "vitest";
import { configuredOAuthProviders, isOAuthProvider, isProviderConfigured } from "./auth-providers";

describe("auth providers", () => {
  it("offers a provider only when both its id and secret are set", () => {
    expect(isProviderConfigured("google", { AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "s" })).toBe(true);
    expect(isProviderConfigured("google", { AUTH_GOOGLE_ID: "id" })).toBe(false);
    expect(isProviderConfigured("facebook", { AUTH_FACEBOOK_ID: " ", AUTH_FACEBOOK_SECRET: "s" })).toBe(false);
  });

  it("lists configured providers in display order", () => {
    const env = { AUTH_FACEBOOK_ID: "f", AUTH_FACEBOOK_SECRET: "s", AUTH_GOOGLE_ID: "g", AUTH_GOOGLE_SECRET: "s" };
    expect(configuredOAuthProviders(env)).toEqual(["google", "facebook"]);
    expect(configuredOAuthProviders({})).toEqual([]);
  });

  it("recognizes only known provider ids", () => {
    expect(isOAuthProvider("google")).toBe(true);
    expect(isOAuthProvider("github")).toBe(false);
    expect(isOAuthProvider(undefined)).toBe(false);
  });
});
