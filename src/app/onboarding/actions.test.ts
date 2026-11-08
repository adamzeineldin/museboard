import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@/generated/prisma/client";
import { canonicalTimeZone, supportedTimeZones } from "@/lib/profile";
import { createTestUser, db, resetDb } from "@/test/db";
import { INITIAL_ONBOARDING_STATE } from "./form-state";

const { requireUser, redirect } = vi.hoisted(() => ({
  requireUser: vi.fn(),
  redirect: vi.fn((to: string) => {
    throw new Error(`NEXT_REDIRECT:${to}`);
  }),
}));
vi.mock("@/lib/current-user", () => ({ requireUser }));
vi.mock("next/navigation", () => ({ redirect }));

const { saveProfile } = await import("./actions");

const VALID = { name: "Jordan Lee", school: "State University", gradYear: "2027", timezone: "America/Chicago" };

const form = (values: Record<string, string>): FormData => {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.append(key, value);
  return data;
};

const newUser = (): Promise<User> => createTestUser({ name: null, school: null, gradYear: null, timezone: "UTC" });

describe("saveProfile", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
  });

  it("saves only the session user's profile, audits it and goes to /jobs", async () => {
    const user = await newUser();
    const other = await newUser();
    requireUser.mockResolvedValue(user);
    await expect(saveProfile(INITIAL_ONBOARDING_STATE, form(VALID))).rejects.toThrow("NEXT_REDIRECT:/jobs");
    const saved = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(saved).toMatchObject({ name: "Jordan Lee", school: "State University", gradYear: 2027, timezone: "America/Chicago" });
    expect((await db.user.findUniqueOrThrow({ where: { id: other.id } })).name).toBeNull();
    const audit = await db.auditEvent.findFirstOrThrow({ where: { userId: user.id, action: "profile.updated" } });
    expect(audit.actor).toBe("user");
    expect(audit.payload).toEqual({ fields: ["name", "school", "gradYear", "timezone"] });
  });

  it("accepts a browser alias like Asia/Kolkata and stores a zone the picker lists", async () => {
    const user = await newUser();
    requireUser.mockResolvedValue(user);
    await expect(saveProfile(INITIAL_ONBOARDING_STATE, form({ ...VALID, timezone: "Asia/Kolkata" }))).rejects.toThrow("NEXT_REDIRECT:/jobs");
    const { timezone } = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(supportedTimeZones("UTC")).toContain(timezone);
    expect(timezone).toBe(canonicalTimeZone("Asia/Kolkata"));
  });

  it("accepts the stored zone the picker offers even when the runtime does not list it", async () => {
    const user = await createTestUser({ name: null, school: null, gradYear: null, timezone: "Etc/GMT+5" });
    requireUser.mockResolvedValue(user);
    await expect(saveProfile(INITIAL_ONBOARDING_STATE, form({ ...VALID, timezone: "Etc/GMT+5" }))).rejects.toThrow("NEXT_REDIRECT:/jobs");
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: "Jordan Lee", timezone: "Etc/GMT+5" });
  });

  it("returns field errors with the submitted values and leaves the row alone", async () => {
    const user = await newUser();
    requireUser.mockResolvedValue(user);
    const submitted = { ...VALID, gradYear: "", timezone: "Nowhere/Land" };
    const state = await saveProfile(INITIAL_ONBOARDING_STATE, form(submitted));
    expect(state.fieldErrors).toEqual({ gradYear: "Check your graduation year", timezone: "Pick a valid time zone" });
    expect(state.formError).toBeNull();
    expect(state.values).toEqual(submitted);
    expect(await db.user.findUniqueOrThrow({ where: { id: user.id } })).toMatchObject({ name: null, timezone: "UTC" });
    expect(await db.auditEvent.count({ where: { userId: user.id } })).toBe(0);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("treats missing or non-text fields as empty", async () => {
    requireUser.mockResolvedValue(await newUser());
    const data = new FormData();
    data.append("name", new Blob(["x"]));
    const state = await saveProfile(INITIAL_ONBOARDING_STATE, data);
    expect(Object.keys(state.fieldErrors).sort()).toEqual(["gradYear", "name", "school", "timezone"]);
    expect(state.values).toEqual({ name: "", school: "", gradYear: "", timezone: "" });
  });

  it("keeps the submitted values and shows a friendly error when the save fails", async () => {
    requireUser.mockResolvedValue(await newUser());
    const update = vi.spyOn(db.user, "update").mockRejectedValueOnce(new Error("disk full"));
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const state = await saveProfile(INITIAL_ONBOARDING_STATE, form(VALID));
    expect(state).toEqual({ fieldErrors: {}, formError: "We couldn't save your profile. Try again.", values: VALID });
    expect(logged).toHaveBeenCalled();
    update.mockRestore();
    logged.mockRestore();
  });

  it("does not let a finished profile be re-submitted through onboarding", async () => {
    const user = await createTestUser({ timezone: "America/New_York" });
    requireUser.mockResolvedValue(user);
    await expect(saveProfile(INITIAL_ONBOARDING_STATE, form({ ...VALID, timezone: "Asia/Tokyo" }))).rejects.toThrow("NEXT_REDIRECT:/jobs");
    expect((await db.user.findUniqueOrThrow({ where: { id: user.id } })).timezone).toBe("America/New_York");
    expect(await db.auditEvent.count({ where: { userId: user.id } })).toBe(0);
  });
});
