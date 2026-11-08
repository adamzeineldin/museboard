import { describe, expect, it } from "vitest";
import { assembleApplicationPacket, STANDARD_NOTES, type PacketInputs } from "./packet-build";

const input: PacketInputs = {
  job: { id: "j1", title: "SWE Intern", url: "https://jobs.example.com/1" },
  companyName: "Stripe",
  user: { name: "Ada Lovelace", email: "ada@example.com", school: "State U", gradYear: 2027 },
  resume: { id: "r1", filename: "Resume_v3.pdf", downloadPath: "/api/resumes/r1" },
  fitLines: ["Built Python services.", "Knows Go.", "Shipped a demo."],
};

describe("assembleApplicationPacket", () => {
  it("builds the role, answers and a tailored summary", () => {
    const packet = assembleApplicationPacket(input);
    expect(packet.role).toEqual({ jobId: "j1", title: "SWE Intern", company: "Stripe", url: "https://jobs.example.com/1" });
    expect(packet.applyUrl).toBe("https://jobs.example.com/1");
    expect(packet.tailoredSummary).toBe(
      "Ada Lovelace is a State U student (class of 2027) applying for SWE Intern at Stripe. Built Python services. Knows Go. Shipped a demo.",
    );
    expect(packet.notes).toEqual([...STANDARD_NOTES]);
  });

  it("flags a missing resume and an incomplete profile instead of guessing", () => {
    const packet = assembleApplicationPacket({
      ...input,
      resume: null,
      user: { name: null, email: "x@example.com", school: null, gradYear: null },
      fitLines: ["", " ", ""],
    });
    expect(packet.resume).toBeNull();
    expect(packet.answers).toEqual({ fullName: "", email: "x@example.com", school: "", gradYear: null });
    expect(packet.tailoredSummary).toBe("The candidate is a student applying for SWE Intern at Stripe.");
    expect(packet.notes).toContain("No resume on file: the user needs to upload one before submitting.");
    expect(packet.notes).toContain("Confirm school and graduation year with the user.");
  });
});
