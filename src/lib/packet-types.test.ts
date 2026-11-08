import { describe, expect, it } from "vitest";
import { ApplicationPacketSchema, parseApplicationPacket, ReferralPacketSchema } from "./packet-types";

const referral = {
  role: { jobId: "greenhouse:stripe:1", title: "SWE Intern", company: "Stripe", url: "https://example.com/1" },
  fitSummary: ["one", "two", "three"],
  resume: { id: "res_1", filename: "Resume_v3.pdf", downloadPath: "/api/resumes/res_1" },
};

const application = {
  ...referral,
  applyUrl: "https://example.com/1",
  answers: { fullName: "Ada L.", email: "ada@example.com", school: "State U", gradYear: 2027 },
  tailoredSummary: "Ada is a CS student.",
  notes: ["Work authorization: ask the user."],
};

describe("packet schemas", () => {
  it("accept a referral packet with or without a role and resume", () => {
    expect(ReferralPacketSchema.parse(referral)).toEqual(referral);
    expect(ReferralPacketSchema.parse({ ...referral, role: null, resume: null })).toMatchObject({ role: null });
  });

  it("require exactly three fit-summary lines", () => {
    expect(ReferralPacketSchema.safeParse({ ...referral, fitSummary: ["a", "b"] }).success).toBe(false);
  });

  it("accept an application packet, location optional", () => {
    expect(ApplicationPacketSchema.parse(application)).toEqual(application);
    const withLocation = { ...application, answers: { ...application.answers, location: "New York" } };
    expect(ApplicationPacketSchema.parse(withLocation).answers.location).toBe("New York");
  });

  it("parseApplicationPacket returns null for stored JSON that doesn't fit", () => {
    expect(parseApplicationPacket(application)).toEqual(application);
    expect(parseApplicationPacket({ applyUrl: 1 })).toBeNull();
    expect(parseApplicationPacket(null)).toBeNull();
  });
});
