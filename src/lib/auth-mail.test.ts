import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sendMail = vi.fn();
vi.mock("nodemailer", () => ({ createTransport: vi.fn(() => ({ sendMail })) }));

const { deliverMagicLink, devMailAllowed, recipientFileName, LAST_LINK_FILE } = await import("./auth-mail");

const URL_OK = "http://localhost:3000/api/auth/callback/nodemailer?token=abc&email=demo%40inroad.test";

describe("deliverMagicLink without EMAIL_SERVER", () => {
  let dir: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "inroad-mail-"));
    vi.stubEnv("DEV_MAIL_DIR", dir);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    await rm(dir, { recursive: true, force: true });
  });

  it("writes the link to last-link.txt and a per-recipient file, and logs it", async () => {
    await deliverMagicLink({ identifier: "Demo@Inroad.test", url: URL_OK, from: "Inroad <no-reply@inroad.test>" });
    expect((await readFile(path.join(dir, LAST_LINK_FILE), "utf8")).trim()).toBe(URL_OK);
    expect((await readFile(path.join(dir, recipientFileName("Demo@Inroad.test")), "utf8")).trim()).toBe(URL_OK);
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining(URL_OK));
  });

  it("refuses the file fallback in production unless INROAD_DEV_MAIL=1", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await expect(deliverMagicLink({ identifier: "a@b.test", url: URL_OK, from: "x@y.test" })).rejects.toThrow(/EMAIL_SERVER/);
    vi.stubEnv("INROAD_DEV_MAIL", "1");
    await expect(deliverMagicLink({ identifier: "a@b.test", url: URL_OK, from: "x@y.test" })).resolves.toBeUndefined();
  });

  it("rejects an invalid email or a non-http URL", async () => {
    await expect(deliverMagicLink({ identifier: "nope", url: URL_OK, from: "x@y.test" })).rejects.toThrow(/invalid/);
    await expect(deliverMagicLink({ identifier: "a@b.test", url: "javascript:alert(1)", from: "x@y.test" })).rejects.toThrow(/invalid/);
  });
});

describe("deliverMagicLink with EMAIL_SERVER", () => {
  beforeEach(() => sendMail.mockReset());

  it("sends the email through nodemailer", async () => {
    sendMail.mockResolvedValue({ rejected: [], pending: [] });
    await deliverMagicLink({ identifier: "a@b.test", url: URL_OK, from: "Inroad <no-reply@inroad.test>", emailServer: "smtp://u:p@smtp.test:587" });
    expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({ to: "a@b.test", subject: "Your Inroad sign-in link" }));
    expect(sendMail.mock.calls[0]?.[0].text).toContain(URL_OK);
  });

  it("throws when the recipient is rejected", async () => {
    sendMail.mockResolvedValue({ rejected: ["a@b.test"], pending: [] });
    await expect(
      deliverMagicLink({ identifier: "a@b.test", url: URL_OK, from: "x@y.test", emailServer: "smtp://smtp.test" }),
    ).rejects.toThrow(/could not be delivered/);
  });
});

describe("helpers", () => {
  it("devMailAllowed outside production only, unless opted in", () => {
    expect(devMailAllowed({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(true);
    expect(devMailAllowed({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(false);
    expect(devMailAllowed({ NODE_ENV: "production", INROAD_DEV_MAIL: "1" } as NodeJS.ProcessEnv)).toBe(true);
  });

  it("recipientFileName is filesystem safe", () => {
    expect(recipientFileName("A+b/../x@inroad.test")).toBe("a_b_.._x_inroad.test.txt");
  });
});
