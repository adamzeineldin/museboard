import type { ApplicationPacket, FitSummary } from "@/lib/packet-types";

// Pure: assemble the packet Inroad hands over for one application (docs/ARCHITECTURE.md "Packets").

export interface PacketInputs {
  job: { id: string; title: string; url: string };
  companyName: string;
  user: { name: string | null; email: string; school: string | null; gradYear: number | null };
  resume: { id: string; filename: string; downloadPath: string } | null;
  fitLines: FitSummary;
}

/** Fields Inroad never answers on the user's behalf. */
export const STANDARD_NOTES = [
  "Work authorization and visa sponsorship: Inroad doesn't know. Ask the user.",
  "Voluntary self-identification (demographic) questions: leave these to the user.",
  "Start date, availability and relocation: confirm with the user.",
] as const;

function tailoredSummary(input: PacketInputs): string {
  const name = input.user.name?.trim() || "The candidate";
  const school = input.user.school?.trim();
  const year = input.user.gradYear ? ` (class of ${input.user.gradYear})` : "";
  const who = school ? `${name} is a ${school} student${year}` : `${name} is a student${year}`;
  const fit = input.fitLines.map((line) => line.trim()).filter(Boolean).join(" ");
  return `${who} applying for ${input.job.title} at ${input.companyName}.${fit ? ` ${fit}` : ""}`;
}

function extraNotes(input: PacketInputs): string[] {
  const notes: string[] = [];
  if (!input.resume) notes.push("No resume on file: the user needs to upload one before submitting.");
  if (!input.user.school?.trim() || !input.user.gradYear) notes.push("Confirm school and graduation year with the user.");
  return notes;
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
