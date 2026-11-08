import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createTransport, type Transporter } from "nodemailer";
import { z } from "zod";
import { devMailAllowed, devMailDir } from "@/lib/auth-mail";
import { DigestConfigError, digestMailConfig, type DigestMailConfig } from "./config";
import type { DigestMessage } from "./types";

// Delivery, following the Auth.js magic-link conventions (src/lib/auth-mail.ts): nodemailer when
// EMAIL_SERVER is set; otherwise (dev, tests, E2E) write .dev-mail/digest-<userId>.html/.txt and log one
// line. The file fallback is refused in production unless INROAD_DEV_MAIL=1.

export interface DigestEnvelope {
  userId: string;
  to: string;
  message: DigestMessage;
  /** Added as a List-Unsubscribe header so mail clients can offer their own "unsubscribe". */
  unsubscribeUrl?: string;
}

export interface DigestMailer {
  send(envelope: DigestEnvelope): Promise<void>;
}

const envelopeSchema = z.object({
  userId: z.string().trim().min(1).max(200),
  to: z.email(),
  unsubscribeUrl: z.url({ protocol: /^https?$/ }).optional(),
});

/** File-system-safe stem for the dev copies. */
export function devDigestStem(userId: string): string {
  return `digest-${userId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

function validate(envelope: DigestEnvelope): void {
  const parsed = envelopeSchema.safeParse(envelope);
  if (!parsed.success) throw new Error("Digest has an invalid recipient address or link");
  if (/[\r\n]/.test(envelope.message.subject)) throw new Error("Digest subject must be a single line");
}

function devMailer(dir: string, log: (line: string) => void): DigestMailer {
  return {
    async send(envelope) {
      validate(envelope);
      await mkdir(dir, { recursive: true });
      const stem = path.join(dir, devDigestStem(envelope.userId));
      await writeFile(`${stem}.html`, envelope.message.html, "utf8");
      await writeFile(`${stem}.txt`, `Subject: ${envelope.message.subject}\n\n${envelope.message.text}`, "utf8");
      log(`[digest] EMAIL_SERVER is not set. Weekly digest for user ${envelope.userId} written to ${stem}.html (and .txt)`);
    },
  };
}

function smtpMailer(transport: Transporter, from: string): DigestMailer {
  return {
    async send(envelope) {
      validate(envelope);
      const { subject, text, html } = envelope.message;
      const result = await transport.sendMail({
        to: envelope.to,
        from,
        subject,
        text,
        html,
        ...(envelope.unsubscribeUrl ? { headers: { "List-Unsubscribe": `<${envelope.unsubscribeUrl}>` } } : {}),
      });
      const failed = [...(result.rejected ?? []), ...(result.pending ?? [])].filter(Boolean);
      if (failed.length > 0) throw new Error("The mail server did not accept the digest");
    },
  };
}

export interface MailerOptions {
  config?: DigestMailConfig;
  env?: NodeJS.ProcessEnv;
  log?: (line: string) => void;
}

export function createDigestMailer(options: MailerOptions = {}): DigestMailer {
  const env = options.env ?? process.env;
  const config = options.config ?? digestMailConfig(env);
  const log = options.log ?? ((line: string) => console.info(line));
  if (config.emailServer) return smtpMailer(createTransport(config.emailServer), config.from);
  if (!devMailAllowed(env)) {
    throw new DigestConfigError("EMAIL_SERVER is not configured. Set it (or INROAD_DEV_MAIL=1 for test deployments).");
  }
  return devMailer(devMailDir(), log);
}
