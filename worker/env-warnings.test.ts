import { describe, expect, it } from "vitest";
import { devFallbackWarnings } from "./env-warnings";

describe("devFallbackWarnings", () => {
  it("warns that digests go to disk when EMAIL_SERVER is unset outside production", () => {
    const warnings = devFallbackWarnings({ APP_URL: "https://inroad.example" });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/EMAIL_SERVER is not set/);
    expect(warnings[0]).toMatch(/NODE_ENV=production/);
  });

  it("treats a blank EMAIL_SERVER as unset", () => {
    expect(devFallbackWarnings({ EMAIL_SERVER: "  ", APP_URL: "https://inroad.example" })).toHaveLength(1);
  });

  it("warns that links point at localhost when APP_URL and AUTH_URL are unset outside production", () => {
    const warnings = devFallbackWarnings({ EMAIL_SERVER: "smtp://mail.example:587" });
    expect(warnings).toEqual([expect.stringMatching(/APP_URL/)]);
  });

  it("says nothing when mail and links are configured", () => {
    expect(devFallbackWarnings({ EMAIL_SERVER: "smtp://mail.example:587", AUTH_URL: "https://inroad.example" })).toEqual([]);
  });

  it("says nothing under NODE_ENV=production, where the digest refuses the fallbacks itself", () => {
    expect(devFallbackWarnings({ NODE_ENV: "production" })).toEqual([]);
  });
});
