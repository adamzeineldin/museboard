import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PAUSED_VIA_EMAIL_ACTION, signLinkToken } from "@/lib/digest";
import { approvedCampaign, MONDAY, newDigestWorld, SECRET } from "@/lib/digest/testing/fixtures";
import { db, resetDb } from "@/test/db";

const { revalidatePath } = vi.hoisted(() => ({ revalidatePath: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath }));

import { pauseCampaignAction } from "./actions";
import PausePage from "./page";

const form = (token: unknown): FormData => {
  const data = new FormData();
  if (typeof token === "string") data.append("token", token);
  return data;
};
const IDLE = { status: "ready", message: "" } as const;

async function renderPage(token: string | string[] | undefined): Promise<string> {
  const element = await PausePage({ searchParams: Promise.resolve({ token }) });
  return renderToStaticMarkup(element);
}

describe("/pause", () => {
  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(MONDAY.getTime() + 60_000));
    vi.stubEnv("AUTH_SECRET", SECRET);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("GET shows what will happen and a POST form, and changes nothing", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const token = signLinkToken({ purpose: "pause", userId: world.user.id, campaignId: campaign.id }, SECRET, MONDAY);
    const auditsBefore = await db.auditEvent.count();

    const html = await renderPage(token);
    expect(html).toContain("<h1>Pause your campaign</h1>");
    expect(html).toContain("Nothing already submitted changes");
    expect(html).toMatch(/<form[^>]*>/);
    expect(html).toContain(`name="token" value="${token}"`);
    expect(html).toContain(">Pause campaign</button>");
    await renderPage(token); // a second prefetch
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("active");
    expect(await db.auditEvent.count()).toBe(auditsBefore);
  });

  it("POST pauses without a session, audits it and refreshes the shell", async () => {
    const world = await newDigestWorld();
    const campaign = await approvedCampaign(world);
    const token = signLinkToken({ purpose: "pause", userId: world.user.id, campaignId: campaign.id }, SECRET, MONDAY);

    const outcome = await pauseCampaignAction(IDLE, form(token));
    expect(outcome.status).toBe("done");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: campaign.id } })).status).toBe("paused");
    expect(await db.auditEvent.count({ where: { userId: world.user.id, action: PAUSED_VIA_EMAIL_ACTION, actor: "user" } })).toBe(1);
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");

    const html = await renderPage(token);
    expect(html).toContain("already paused");
    expect(html).not.toContain("<form");
  });

  it("shows a safe message for missing, expired or tampered links", async () => {
    expect(await renderPage(undefined)).toContain("This link isn&#x27;t valid");
    expect(await renderPage(["a.b", "c.d"])).toContain('role="alert"');
    const expired = signLinkToken({ purpose: "pause", userId: "u", campaignId: "c" }, SECRET, new Date("2026-10-01T00:00:00Z"));
    expect(await renderPage(expired)).toContain("This link has expired");
    expect((await pauseCampaignAction(IDLE, form(undefined))).status).toBe("invalid");
    expect((await pauseCampaignAction(IDLE, form("x".repeat(2000)))).status).toBe("invalid");
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
