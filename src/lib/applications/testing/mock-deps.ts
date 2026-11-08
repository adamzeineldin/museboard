import { vi } from "vitest";
import type { Contact, Outreach, Resume } from "@/generated/prisma/client";
import { db } from "@/test/db";

// Stand-ins for other milestones' modules (see ../deps.ts). Use in a test file with:
//   vi.mock("@/lib/applications/deps", async () => (await import("./testing/mock-deps")).mockDeps);

export const FIT_LINES: [string, string, string] = ["Built Python services.", "Knows Go.", "Shipped a payments demo."];

export const bestContactAt = vi.fn<(userId: string, companyId: string) => Promise<Contact | null>>();
export const createReferralAskDraft = vi.fn<(userId: string, contactId: string, jobId?: string, actor?: string) => Promise<Outreach>>();

/** Mirrors the contract: the user's default resume, else the newest one. */
async function getDefaultResume(userId: string): Promise<Resume | null> {
  return db.resume.findFirst({ where: { userId }, orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }] });
}

/** A real draft row, as the outreach module would write. */
export async function realisticDraft(userId: string, contactId: string, jobId?: string): Promise<Outreach> {
  const contact = await db.contact.findUniqueOrThrow({ where: { id: contactId } });
  return db.outreach.create({
    data: { userId, contactId, jobId: jobId ?? null, companyId: contact.companyId, kind: "referral_ask", draft: "Hi" },
  });
}

export function resetDepMocks(): void {
  bestContactAt.mockReset();
  bestContactAt.mockResolvedValue(null);
  createReferralAskDraft.mockReset();
  createReferralAskDraft.mockImplementation(realisticDraft);
}

export const mockDeps = {
  fitSummary: () => FIT_LINES,
  resumeDownloadPath: (id: string) => `/api/resumes/${id}`,
  getDefaultResume,
  bestContactAt,
  createReferralAskDraft,
};
