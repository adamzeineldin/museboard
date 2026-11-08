import { cleanText, formatIsoDay, formatWeekday, plural } from "./format";
import type { DigestCampaign, DigestData, DigestLinks, DigestList, DigestReferralDraft, DigestRole } from "./types";

// Pure: turns digest data into the words both renderers lay out, so the HTML and plain-text versions
// always say the same thing.

export interface ViewItem {
  primary: string;
  secondary: string;
}

export interface ViewSection {
  id: "went-out" | "ready" | "waiting" | "referrals";
  heading: string;
  /** Shown above the list (e.g. the "Inroad never sends these" reminder). */
  note: string | null;
  items: ViewItem[];
  empty: string;
  /** "+ 3 more in Inroad", or null. */
  more: string | null;
  link: { label: string; href: string };
}

export interface ViewCampaign {
  heading: string;
  lines: string[];
  /** The one-click pause button, only for an active campaign. */
  pause: { label: string; href: string } | null;
  link: { label: string; href: string };
}

export interface DigestView {
  subject: string;
  preheader: string;
  greeting: string;
  intro: string;
  campaign: ViewCampaign;
  sections: ViewSection[];
  footer: string[];
  unsubscribe: { label: string; href: string };
}

const roleLine = (role: DigestRole): string => `${cleanText(role.company, 80)} · ${cleanText(role.title, 140)}`;

function moreLine<T>(list: DigestList<T>): string | null {
  const hidden = list.total - list.items.length;
  return hidden > 0 ? `+ ${hidden} more in Inroad` : null;
}

function campaignView(campaign: DigestCampaign, links: DigestLinks): ViewCampaign {
  const cap = campaign.weeklyCap === null ? null : `${campaign.weekCount} of ${campaign.weeklyCap} applications that week.`;
  const ends = campaign.endsOn ? `Runs through ${formatIsoDay(campaign.endsOn)}.` : null;
  const pending = campaign.hasPendingChanges
    ? "You changed the rules. Inroad keeps using the version you approved until you approve the new one."
    : null;
  const link = { label: "Open your campaign", href: links.campaign };
  const compact = (lines: (string | null)[]): string[] => lines.filter((line): line is string => line !== null);
  switch (campaign.kind) {
    case "active":
      return {
        heading: "Your campaign is active",
        lines: compact([cap, ends, pending, "Want Inroad to stop preparing applications? Pause it with one click."]),
        pause: links.pause ? { label: "Pause campaign", href: links.pause } : null,
        link,
      };
    case "paused":
      return {
        heading: "Your campaign is paused",
        lines: compact([cap, "Inroad isn't preparing applications. Resume it in Inroad when you're ready.", pending]),
        pause: null,
        link,
      };
    case "ended":
      return {
        heading: "Your campaign has ended",
        lines: compact([cap, "Approve new rules in Inroad to keep going."]),
        pause: null,
        link,
      };
    case "revoked":
      return { heading: "Your campaign was revoked", lines: ["Inroad isn't applying for you. Approve new rules to start again."], pause: null, link };
    case "not_approved":
      return { heading: "Your campaign isn't approved yet", lines: ["Nothing goes out until you approve it."], pause: null, link };
    case "none":
      return {
        heading: "You don't have a campaign",
        lines: ["Inroad only applies inside a campaign you approve."],
        pause: null,
        link: { label: "Set one up", href: links.campaign },
      };
  }
}

function roleSection(
  id: ViewSection["id"],
  heading: string,
  list: DigestList<DigestRole>,
  secondary: (role: DigestRole) => string,
  empty: string,
  link: ViewSection["link"],
): ViewSection {
  return {
    id,
    heading,
    note: null,
    items: list.items.map((role) => ({ primary: roleLine(role), secondary: secondary(role) })),
    empty,
    more: moreLine(list),
    link,
  };
}

function referralItem(draft: DigestReferralDraft): ViewItem {
  const target = draft.title ? `${cleanText(draft.company, 80)} · ${cleanText(draft.title, 140)}` : cleanText(draft.company, 80);
  return {
    primary: `Referral ask to ${cleanText(draft.contactName, 80)}`,
    secondary: `${target}${draft.markedSent ? " · you marked it sent" : " · not sent"}`,
  };
}

function subjectFor(data: DigestData): string {
  const sent = `${data.submitted.total} sent`;
  const waiting = `${data.waiting.total} waiting on you`;
  return `Your Inroad week of ${formatIsoDay(data.week.firstDay)}: ${sent}, ${waiting}`;
}

export function buildDigestView(data: DigestData, links: DigestLinks): DigestView {
  const tz = data.week.timeZone;
  const when = (role: DigestRole, verb: string): string => (role.at ? `${verb} ${formatWeekday(role.at, tz)}` : verb);
  const activity = { label: "Open Activity", href: links.activity };
  const sections: ViewSection[] = [
    roleSection("went-out", "What went out", data.submitted, (r) => when(r, "Submitted"), "Nothing was submitted that week.", activity),
    roleSection("ready", "Ready to submit", data.ready, (r) => cleanText(r.reason), "Nothing is waiting to be submitted.", activity),
    roleSection("waiting", "Waiting on you", data.waiting, (r) => cleanText(r.reason), "Nothing needs your decision.", activity),
    {
      id: "referrals",
      heading: "Referral drafts",
      note: "Inroad never sends these. Review each one and send it yourself, from your own account.",
      items: data.referralDrafts.items.map(referralItem),
      empty: "No new referral drafts that week.",
      more: moreLine(data.referralDrafts),
      link: { label: "Open Warm paths", href: links.warmPaths },
    },
  ];
  const range = `${formatIsoDay(data.week.firstDay)} – ${formatIsoDay(data.week.lastDay)}`;
  return {
    subject: subjectFor(data),
    preheader: `${plural(data.submitted.total, "application")} went out, ${data.ready.total} ready to submit, ${data.waiting.total} waiting on you.`,
    greeting: data.firstName ? `Hi ${cleanText(data.firstName, 60)},` : "Hi,",
    intro: `Here's your Inroad week, ${range} (${tz} time).`,
    campaign: campaignView(data.campaign, links),
    sections,
    footer: [
      "Inroad applies only inside a campaign you approved, and never sends outreach for you.",
      "You get this email once a week because you have an Inroad account.",
    ],
    unsubscribe: { label: "Stop these emails", href: links.unsubscribe },
  };
}
