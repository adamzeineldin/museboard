import { escapeHtml, safeHref } from "./format";
import type { DigestView, ViewItem, ViewSection } from "./view";

// Email HTML: table layout, inline styles only (mail clients drop <style> and classes), a light palette
// from the prototype. Text uses the ink green and dark greys for WCAG AA contrast on white; the bright
// accent (#10B47E) is decorative only. Every interpolated value is escaped; every href is checked.

const C = {
  bg: "#F4F7F6",
  surface: "#FFFFFF",
  soft: "#EEF3F1",
  fg: "#14201C",
  muted: "#5E6C67",
  line: "#E1E8E5",
  accent: "#10B47E",
  ink: "#0A7A56",
  onInk: "#FFFFFF",
} as const;

const FONT = "'Plus Jakarta Sans','Segoe UI',Helvetica,Arial,sans-serif";
const e = escapeHtml;

const textLink = (label: string, href: string): string =>
  `<a href="${safeHref(href)}" style="color:${C.ink};font-weight:600;text-decoration:underline">${e(label)}</a>`;

const button = (label: string, href: string): string =>
  `<a href="${safeHref(href)}" style="display:inline-block;background:${C.ink};color:${C.onInk};font-weight:700;` +
  `text-decoration:none;padding:12px 20px;border-radius:10px;font-size:15px;line-height:20px">${e(label)}</a>`;

const paragraph = (text: string, color: string = C.fg): string =>
  `<p style="margin:0 0 10px;font-size:15px;line-height:22px;color:${color}">${e(text)}</p>`;

const listItem = (item: ViewItem): string =>
  `<li style="margin:0 0 10px;padding:0"><span style="display:block;font-size:15px;line-height:21px;color:${C.fg};font-weight:600">` +
  `${e(item.primary)}</span><span style="display:block;font-size:14px;line-height:20px;color:${C.muted}">${e(item.secondary)}</span></li>`;

function sectionHtml(section: ViewSection): string {
  const headingId = `digest-${section.id}`;
  const body =
    section.items.length === 0
      ? paragraph(section.empty, C.muted)
      : `<ul style="margin:0 0 6px;padding:0 0 0 18px">${section.items.map(listItem).join("")}</ul>`;
  const note = section.note
    ? `<p style="margin:0 0 12px;padding:10px 12px;background:${C.soft};border-radius:8px;font-size:14px;line-height:20px;color:${C.fg}">${e(section.note)}</p>`
    : "";
  const more = section.more ? paragraph(section.more, C.muted) : "";
  return (
    `<tr><td style="padding:20px 24px 4px;border-top:1px solid ${C.line}">` +
    `<h2 id="${headingId}" style="margin:0 0 10px;font-size:17px;line-height:24px;color:${C.fg}">${e(section.heading)}</h2>` +
    `${note}${body}${more}<p style="margin:0 0 16px;font-size:14px">${textLink(section.link.label, section.link.href)}</p></td></tr>`
  );
}

function campaignHtml(view: DigestView): string {
  const { campaign } = view;
  const pause = campaign.pause ? `<p style="margin:14px 0 10px">${button(campaign.pause.label, campaign.pause.href)}</p>` : "";
  return (
    `<tr><td style="padding:4px 24px 20px"><div style="background:${C.soft};border-radius:12px;padding:16px 18px">` +
    `<h2 style="margin:0 0 8px;font-size:17px;line-height:24px;color:${C.fg}">${e(campaign.heading)}</h2>` +
    `${campaign.lines.map((line) => paragraph(line)).join("")}${pause}` +
    `<p style="margin:4px 0 0;font-size:14px">${textLink(campaign.link.label, campaign.link.href)}</p></div></td></tr>`
  );
}

export function renderDigestHtml(view: DigestView): string {
  const footer = view.footer.map((line) => paragraph(line, C.muted)).join("");
  return [
    `<!doctype html><html lang="en"><head><meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light">`,
    `<meta name="supported-color-schemes" content="light"><title>${e(view.subject)}</title></head>`,
    `<body style="margin:0;padding:0;background:${C.bg};font-family:${FONT};color:${C.fg}">`,
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${e(view.preheader)}</div>`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:24px 12px">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${C.surface};border:1px solid ${C.line};border-radius:16px;border-top:4px solid ${C.accent}">`,
    `<tr><td style="padding:22px 24px 6px"><p style="margin:0 0 14px;font-size:14px;font-weight:800;letter-spacing:.02em;color:${C.ink}">Inroad</p>`,
    `<h1 style="margin:0 0 12px;font-size:22px;line-height:30px;color:${C.fg}">${e(view.greeting)}</h1>${paragraph(view.intro)}</td></tr>`,
    campaignHtml(view),
    view.sections.map(sectionHtml).join(""),
    `<tr><td style="padding:18px 24px 22px;border-top:1px solid ${C.line}">${footer}`,
    `<p style="margin:0;font-size:14px">${textLink(view.unsubscribe.label, view.unsubscribe.href)}</p></td></tr>`,
    `</table></td></tr></table></body></html>`,
  ].join("\n");
}
