import "server-only";
import type { Company, Job, Resume, User } from "@/generated/prisma/client";
import type { ApplicationPacket, FitSummary } from "@/lib/packet-types";
import { fitSummary, resumeDownloadPath } from "./deps";
import { assembleApplicationPacket } from "./packet-build";

export type JobWithCompany = Job & { company: Company };

const NO_FIT: FitSummary = [
  "Fit summary unavailable for this role.",
  "Review the posting's requirements against the resume.",
  "Highlight the most relevant project in the application.",
];

function safeFitLines(resume: Resume | null, job: JobWithCompany): FitSummary {
  try {
    return fitSummary(resume?.parsedText ?? "", {
      title: job.title,
      description: job.description ?? "",
      companyName: job.company.name,
    });
  } catch (error) {
    console.error("[applications] fitSummary failed", { jobId: job.id, error: error instanceof Error ? error.message : error });
    return NO_FIT;
  }
}

/** Build the application packet for a job with the given resume (null when the user has none). */
export function buildApplicationPacket(user: User, job: JobWithCompany, resume: Resume | null): ApplicationPacket {
  return assembleApplicationPacket({
    job: { id: job.id, title: job.title, url: job.url },
    companyName: job.company.name,
    user: { name: user.name, email: user.email, school: user.school, gradYear: user.gradYear },
    resume: resume ? { id: resume.id, filename: resume.filename, downloadPath: resumeDownloadPath(resume.id) } : null,
    fitLines: safeFitLines(resume, job),
  });
}
