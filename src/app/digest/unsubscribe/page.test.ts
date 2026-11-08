import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signLinkToken, UNSUBSCRIBED_VIA_EMAIL_ACTION } from "@/lib/digest";
import { MONDAY, newDigestWorld, SECRET } from "@/lib/digest/testing/fixtures";
import { db, resetDb } from "@/test/db";
import { unsubscribeAction } from "./actions";
import UnsubscribePage from "./page";

const form = (token: string): FormData => {
  const data = new FormData();
  data.append("token", token);
  return data;
};
const IDLE = { status: "ready", message: "" } as const;
const renderPage = async (token: string) =>
  renderToStaticMarkup(await UnsubscribePage({ searchParams: Promise.resolve({ token }) }));

describe("/digest/unsubscribe", () => {
  beforeEach(async () => {
    await resetDb();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY.getTime() + 60_000));
    vi.stubEnv("AUTH_SECRET", SECRET);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("GET only shows the button; POST opts out without a session and audits it", async () => {
    const world = await newDigestWorld();
    const token = signLinkToken({ purpose: "unsubscribe", userId: world.user.id }, SECRET, MONDAY);

    const html = await renderPage(token);
    expect(html).toContain("<h1>Stop the weekly digest</h1>");
    expect(html).toContain(">Stop these emails</button>");
    expect((await db.user.findUniqueOrThrow({ where: { id: world.user.id } })).digestOptOut).toBe(false);
    expect(await db.auditEvent.count()).toBe(0);

    expect((await unsubscribeAction(IDLE, form(token))).status).toBe("done");
    expect((await db.user.findUniqueOrThrow({ where: { id: world.user.id } })).digestOptOut).toBe(true);
    expect(await db.auditEvent.count({ where: { userId: world.user.id, action: UNSUBSCRIBED_VIA_EMAIL_ACTION, actor: "user" } })).toBe(1);
    expect(await renderPage(token)).toContain("already stopped");
  });

  it("refuses a pause token", async () => {
    const world = await newDigestWorld();
    const token = signLinkToken({ purpose: "pause", userId: world.user.id, campaignId: "c" }, SECRET, MONDAY);
    expect((await unsubscribeAction(IDLE, form(token))).status).toBe("invalid");
    expect(await renderPage(token)).toContain("This link isn&#x27;t valid");
  });
});
