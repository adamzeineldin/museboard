import type { ApplicationPacket, FitSummary } from "@/lib/packet-types";

// Pure: assemble the packet Inroad hands over for one application (docs/ARCHITECTURE.md "Packets").

export interface PacketInputs {
  job: { id: string; title: string; url: string };
  companyName: string;
  user: { name: string | null; email: string; school: string | null; gradYear: number | null };
  resume: { id: string; filename: string; downloadPath: string } | null;
  fitLines: FitSummary;
}

/**
 * Fields Inroad never answers on the applicant's behalf. Worded about "the applicant" so the same
 * line reads naturally on the web (shown to the applicant) and to Muse (which asks them).
 */
export const STANDARD_NOTES = [
  "Work authorization and visa sponsorship: Inroad never answers these. The applicant answers them.",
  "Voluntary self-identification (demographic) questions: left to the applicant.",
  "Start date, availability and relocation: the applicant confirms these.",
] as const;

export const NO_RESUME_NOTE = "No resume on file: the applicant uploads one before submitting.";
export const PROFILE_NOTE = "School and graduation year are missing: the applicant confirms them.";

function tailoredSummary(input: PacketInputs): string {
  const name = input.user.name?.trim() || "The candidate";
  const school = input.user.school?.trim();
  const year = input.user.gradYear ? ` (class of ${input.user.gradYear})` : "";
  const who = school ? `${name} is a ${school} student${year}` : `${name} is a student${year}`;
  const fit = input.fitLines.map((line) => line.trim()).filter(Boolean).join(" ");
  return `${who} applying for ${input.job.title} at ${input.companyName}.${fit ? ` ${fit}` : ""}`;
}

function extraNotes(input: PacketInputs): string[] {
  return [
    ...(input.resume ? [] : [NO_RESUME_NOTE]),
    ...(!input.user.school?.trim() || !input.user.gradYear ? [PROFILE_NOTE] : []),
  ];
}

export function assembleApplicationPacket(input: PacketInputs): ApplicationPacket {
  return {
    role: { jobId: input.job.id, title: input.job.title, company: input.companyName, url: input.job.url },
    fitSummary: input.fitLines,
    resume: input.resume,
    applyUrl: input.job.url,
    answers: {
      fullName: input.user.name?.trim() ?? "",
      email: input.user.email,
      school: input.user.school?.trim() ?? "",
      gradYear: input.user.gradYear,
    },
    tailoredSummary: tailoredSummary(input),
    notes: [...STANDARD_NOTES, ...extraNotes(input)],
  };
}
