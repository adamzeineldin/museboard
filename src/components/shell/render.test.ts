import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CampaignCard } from "./CampaignCard";
import { MusePanel } from "./MusePanel";

const NOW = new Date("2026-11-07T12:00:00Z");

describe("MusePanel", () => {
  it("shows each tool call with a visible failed marker when the call failed", () => {
    const html = renderToStaticMarkup(
      createElement(MusePanel, {
        connection: "connected",
        now: NOW,
        events: [
          { id: "a", tool: "inroad.submit_application", summary: "Not released", failed: true, createdAt: NOW },
          { id: "b", tool: "inroad.find_roles", summary: "8 roles", failed: false, createdAt: NOW },
        ],
      }),
    );
    expect(html.match(/Failed/g)).toHaveLength(1);
    expect(html).toContain("inroad.submit_application");
    expect(html).toContain("Connected");
  });

  it("says when a token exists but Muse has not used it yet", () => {
    const html = renderToStaticMarkup(createElement(MusePanel, { connection: "unused", events: [], now: NOW }));
    expect(html).toContain(">Not used yet<");
    expect(html).toContain("You created a token. Muse hasn&#x27;t used it yet.");
    expect(html).not.toContain("Your agent, using Inroad");
    expect(html).not.toContain(">Connected<");
  });
});

describe("CampaignCard", () => {
  it("shows an ended campaign as Ended with a link to set new dates", () => {
    const html = renderToStaticMarkup(
      createElement(CampaignCard, { campaign: { status: "ended", weeklyCap: 5, endsOn: "2026-11-01", weekCount: 0, pastEnd: true } }),
    );
    expect(html).toContain("<b>Ended</b>");
    expect(html).not.toContain("used this week");
    expect(html).toContain('href="/campaign"');
  });

  it("shows a paused campaign past its end date with a link to set new dates and no meter", () => {
    const html = renderToStaticMarkup(
      createElement(CampaignCard, { campaign: { status: "paused", weeklyCap: 5, endsOn: "2026-11-01", weekCount: 1, pastEnd: true } }),
    );
    expect(html).toContain("<b>Paused</b>");
    expect(html).toContain("Ended Nov 1. Pick a new end date, then resume.");
    expect(html).not.toContain("start again");
    expect(html).not.toContain('class="meter"');
    expect(html).toContain('href="/campaign"');
    expect(html).toContain("Set new dates");
  });
});
