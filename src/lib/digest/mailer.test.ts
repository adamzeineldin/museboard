import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
const createTransport = vi.fn(() => ({ sendMail }));
vi.mock("nodemailer", () => ({ createTransport }));

const { createDigestMailer, devDigestStem } = await import("./mailer");
const { DigestConfigError } = await import("./config");

const message = { subject: "Your Inroad week of Nov 2: 1 sent, 0 waiting on you", text: "plain", html: "<p>html</p>" };
const envelope = { userId: "user_1", to: "jordan@school.test", message, unsubscribeUrl: "https://inroad.test/digest/unsubscribe?token=a.b" };

describe("createDigestMailer without EMAIL_SERVER", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "inroad-digest-mail-"));
    vi.stubEnv("DEV_MAIL_DIR", dir);
  });
  afterEach(async () => {
    vi.unstubAllEnvs();
    await rm(dir, { recursive: true, force: true });
  });

  it("writes digest-<userId>.html/.txt to the dev-mail dir and logs one line without the address", async () => {
    const log = vi.fn();
    await createDigestMailer({ env: { NODE_ENV: "test" } as NodeJS.ProcessEnv, log }).send(envelope);
    expect(await readFile(path.join(dir, "digest-user_1.html"), "utf8")).toBe("<p>html</p>");
    expect(await readFile(path.join(dir, "digest-user_1.txt"), "utf8")).toBe(`Subject: ${message.subject}\n\nplain`);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).toMatch(/^\[digest\] EMAIL_SERVER is not set\. Weekly digest for user user_1 written to/);
    expect(log.mock.calls[0]?.[0]).not.toContain("jordan@school.test");
  });

  it("refuses the file fallback in production unless INROAD_DEV_MAIL=1", () => {
    expect(() => createDigestMailer({ env: { NODE_ENV: "production" } as NodeJS.ProcessEnv })).toThrow(DigestConfigError);
    expect(() => createDigestMailer({ env: { NODE_ENV: "production", INROAD_DEV_MAIL: "1" } as NodeJS.ProcessEnv, log: vi.fn() })).not.toThrow();
  });

  it("validates the envelope and keeps file names safe", async () => {
    const mailer = createDigestMailer({ env: { NODE_ENV: "test" } as NodeJS.ProcessEnv, log: vi.fn() });
    await expect(mailer.send({ ...envelope, to: "not-an-email" })).rejects.toThrow(/invalid recipient/);
    await expect(mailer.send({ ...envelope, message: { ...message, subject: "a\r\nBcc: x@y.test" } })).rejects.toThrow(/single line/);
    expect(devDigestStem("../../etc/passwd")).toBe("digest-______etc_passwd");
  });
});

describe("createDigestMailer with EMAIL_SERVER", () => {
  beforeEach(() => {
    sendMail.mockReset();
    createTransport.mockClear();
  });

  it("sends html + text with a List-Unsubscribe header through nodemailer", async () => {
    sendMail.mockResolvedValue({ rejected: [], pending: [] });
    const mailer = createDigestMailer({ config: { from: "Inroad <no-reply@inroad.test>", emailServer: "smtp://u:p@smtp.test:587" } });
    await mailer.send(envelope);
    expect(createTransport).toHaveBeenCalledWith("smtp://u:p@smtp.test:587");
    expect(sendMail).toHaveBeenCalledWith({
      to: "jordan@school.test",
      from: "Inroad <no-reply@inroad.test>",
      ...message,
      headers: { "List-Unsubscribe": "<https://inroad.test/digest/unsubscribe?token=a.b>" },
    });
  });

  it("throws when the server rejects the recipient", async () => {
    sendMail.mockResolvedValue({ rejected: ["jordan@school.test"], pending: [] });
    const mailer = createDigestMailer({ config: { from: "x@inroad.test", emailServer: "smtp://smtp.test" } });
    await expect(mailer.send(envelope)).rejects.toThrow(/did not accept/);
  });
});
