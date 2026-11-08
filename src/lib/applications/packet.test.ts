import { describe, expect, it, vi } from "vitest";
import type { Company, Job, Resume, User } from "@/generated/prisma/client";

const fitSummary = vi.fn();
vi.mock("@/lib/applications/deps", () => ({
  fitSummary,
  resumeDownloadPath: (id: string) => `/api/resumes/${id}`,
}));

const { buildApplicationPacket } = await import("./packet");

const user = { name: "Ada", email: "ada@inroad.test", school: "Test U", gradYear: 2027 } as User;
const job = {
  id: "j1",
  title: "SWE Intern",
  url: "https://jobs.example.com/1",
  description: null,
  company: { name: "Stripe" } as Company,
} as Job & { company: Company };
const resume = { id: "r1", filename: "Resume.pdf", parsedText: "python" } as Resume;

describe("buildApplicationPacket", () => {
  it("passes the resume text and job to fitSummary", () => {
    fitSummary.mockReturnValueOnce(["a", "b", "c"]);
    const packet = buildApplicationPacket(user, job, resume);
    expect(fitSummary).toHaveBeenCalledWith("python", { title: "SWE Intern", description: "", companyName: "Stripe" });
    expect(packet.fitSummary).toEqual(["a", "b", "c"]);
    expect(packet.resume).toEqual({ id: "r1", filename: "Resume.pdf", downloadPath: "/api/resumes/r1" });
  });

  it("falls back to neutral fit lines when fitSummary throws, and works without a resume", () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    fitSummary.mockImplementationOnce(() => {
      throw new Error("model down");
    });
    const packet = buildApplicationPacket(user, job, null);
    expect(fitSummary).toHaveBeenLastCalledWith("", expect.anything());
    expect(packet.fitSummary[0]).toBe("Fit summary unavailable for this role.");
    expect(packet.resume).toBeNull();
    expect(logged).toHaveBeenCalledWith("[applications] fitSummary failed", { jobId: "j1", error: "model down" });
    fitSummary.mockImplementationOnce(() => {
      throw "plain";
    });
    expect(buildApplicationPacket(user, job, resume).fitSummary[0]).toBe("Fit summary unavailable for this role.");
    expect(logged).toHaveBeenLastCalledWith("[applications] fitSummary failed", { jobId: "j1", error: "plain" });
    logged.mockRestore();
  });
});
