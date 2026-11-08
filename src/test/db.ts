import { db } from "@/lib/db";
import type { User } from "@/generated/prisma/client";

export { db };

/** Delete every row, children first. Call in beforeEach for DB tests. */
export async function resetDb(): Promise<void> {
  await db.$transaction([
    db.auditEvent.deleteMany(),
    db.outreach.deleteMany(),
    db.application.deleteMany(),
    db.match.deleteMany(),
    db.campaignVersion.deleteMany(),
    db.campaign.deleteMany(),
    db.contact.deleteMany(),
    db.resume.deleteMany(),
    db.connectorToken.deleteMany(),
    db.session.deleteMany(),
    db.account.deleteMany(),
    db.verificationToken.deleteMany(),
    db.job.deleteMany(),
    db.company.deleteMany(),
    db.user.deleteMany(),
  ]);
}

let userCounter = 0;

/** Create a user with a complete profile. Pass overrides for anything the test cares about. */
export async function createTestUser(overrides: Partial<Pick<User, "email" | "name" | "school" | "gradYear" | "timezone">> = {}): Promise<User> {
  userCounter += 1;
  return db.user.create({
    data: {
      email: `user${userCounter}-${Date.now()}@inroad.test`,
      name: "Test Student",
      school: "Test University",
      gradYear: 2027,
      timezone: "America/New_York",
      ...overrides,
    },
  });
}
