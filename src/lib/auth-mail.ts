import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTransport } from "nodemailer";
import { z } from "zod";

// Magic-link delivery for the Auth.js Nodemailer provider.
// With EMAIL_SERVER set, the link is emailed. Without it (local dev, tests, E2E) the link is printed to the
// server console and written to .dev-mail/last-link.txt so tests can follow it. In production the file
// fallback must be enabled explicitly with INROAD_DEV_MAIL=1 (for E2E against `next start`).

export const DEFAULT_DEV_MAIL_DIR = ".dev-mail";
export const LAST_LINK_FILE = "last-link.txt";

const linkSchema = z.object({
  identifier: z.email(),
  url: z.url({ protocol: /^https?$/ }),
});

export interface MagicLinkRequest {
  identifier: string;
  url: string;
  from: string;
  emailServer?: string;
}

export function devMailDir(): string {
  // Runtime-only path: tell Turbopack not to trace the whole project for it.
  return path.resolve(/*turbopackIgnore: true*/ process.cwd(), process.env.DEV_MAIL_DIR ?? DEFAULT_DEV_MAIL_DIR);
}

/** File name for the per-recipient copy of the latest link, e.g. demo_inroad.test.txt. */
export function recipientFileName(email: string): string {
  return `${email.toLowerCase().replace(/[^a-z0-9.-]/g, "_")}.txt`;
}

export function devMailAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.NODE_ENV !== "production" || env.INROAD_DEV_MAIL === "1";
}

/** Dev fallback: log the link and write it to <dir>/last-link.txt plus a per-recipient file. */
export async function writeDevMagicLink(identifier: string, url: string, dir: string = devMailDir()): Promise<string> {
  await mkdir(dir, { recursive: true });
  const lastLinkPath = path.join(dir, LAST_LINK_FILE);
  await writeFile(lastLinkPath, `${url}\n`, "utf8");
  await writeFile(path.join(dir, recipientFileName(identifier)), `${url}\n`, "utf8");
  console.info(`[inroad] EMAIL_SERVER is not set. Magic sign-in link for ${identifier}:\n${url}\n(also written to ${lastLinkPath})`);
  return lastLinkPath;
}

function emailBody(url: string): { subject: string; text: string; html: string } {
  const host = new URL(url).host;
  const subject = "Your Inroad sign-in link";
  const text = `Sign in to Inroad (${host}):\n${url}\n\nIf you didn't ask for this, you can ignore this email.\n`;
  const safeUrl = url.replace(/"/g, "&quot;");
  const html = `<p>Sign in to Inroad (${host}).</p><p><a href="${safeUrl}">Sign in</a></p><p>If you didn't ask for this, you can ignore this email.</p>`;
  return { subject, text, html };
}

export async function deliverMagicLink(request: MagicLinkRequest): Promise<void> {
  const parsed = linkSchema.safeParse(request);
  if (!parsed.success) {
    throw new Error("Magic link request has an invalid email address or URL");
  }
  const { identifier, url } = parsed.data;

  if (!request.emailServer) {
    if (!devMailAllowed()) {
      throw new Error("EMAIL_SERVER is not configured. Set it (or INROAD_DEV_MAIL=1 for test deployments).");
    }
    await writeDevMagicLink(identifier, url);
    return;
  }

  const transport = createTransport(request.emailServer);
  const result = await transport.sendMail({ to: identifier, from: request.from, ...emailBody(url) });
  const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
  if (failed.length > 0) {
    throw new Error(`Sign-in email could not be delivered to ${failed.length} recipient(s)`);
  }
}
