import type { User } from "@/generated/prisma/client";
import { approveVersion, proposeVersion } from "@/lib/campaign";
import { createConnectorToken } from "@/lib/connector";
import { recomputeMatches } from "@/lib/matching";
import { createContact } from "@/lib/outreach";
import { uploadResume } from "@/lib/resume";
import type { ConnectorScope } from "@/lib/types";
import { campaignRules, newStudent, RESUME_TXT, seedJobs } from "@/test/integration/world";

// A signed-up student with a resume, scored matches, two contacts at Meta (ask-first) and an approved
// campaign (cap 2, see campaignRules), plus a helper to mint connector tokens. Built on the shared world fixtures.

export interface McpWorld {
  user: User;
  resumeId: string;
  versionId: string;
  bestContactId: string;
}

export async function studentWithCampaign(seed = true): Promise<McpWorld> {
  const now = new Date();
  if (seed) await seedJobs();
  const user = await newStudent();
  const { resume } = await uploadResume(user.id, { filename: "jordan-lee.txt", bytes: RESUME_TXT });
  await recomputeMatches(user.id);
  await createContact(user.id, { name: "Priya Shah", role: "Software Engineer", company: "Meta", relationship: "Alum" });
  const best = await createContact(user.id, {
    name: "Alex Kim",
    role: "Engineering Manager",
    company: "Meta",
    relationship: "Met at a coffee chat",
  });
  const proposed = await proposeVersion(user.id, campaignRules(resume.id, now), "web");
  const approved = await approveVersion(user.id, proposed.id, "web");
  return { user, resumeId: resume.id, versionId: approved.id, bestContactId: best.id };
}

export async function tokenFor(userId: string, scope: ConnectorScope = "write"): Promise<string> {
  return (await createConnectorToken(userId, `Test ${scope}`, scope)).token;
}
