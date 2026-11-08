import type { DigestView, ViewSection } from "./view";

// Plain-text alternative. Every value already went through cleanText in the view model.

const RULE = "----------------------------------------";

/** A heading underlined with dashes (plain text has no markup; capitals read as shouting). */
const heading = (text: string): string[] => [text, "-".repeat(text.length)];

function sectionText(section: ViewSection): string[] {
  const lines = heading(section.heading);
  if (section.note) lines.push(section.note);
  if (section.items.length === 0) lines.push(section.empty);
  for (const item of section.items) lines.push(`- ${item.primary}`, `  ${item.secondary}`);
  if (section.more) lines.push(section.more);
  lines.push(`${section.link.label}: ${section.link.href}`);
  return lines;
}

export function renderDigestText(view: DigestView): string {
  const campaign = [
    ...heading(view.campaign.heading),
    ...view.campaign.lines,
    ...(view.campaign.pause ? [`${view.campaign.pause.label}: ${view.campaign.pause.href}`] : []),
    `${view.campaign.link.label}: ${view.campaign.link.href}`,
  ];
  const blocks = [[view.greeting, "", view.intro], campaign, ...view.sections.map(sectionText)];
  const footer = [...view.footer, `${view.unsubscribe.label}: ${view.unsubscribe.href}`];
  return `${[...blocks, footer].map((block) => block.join("\n")).join(`\n\n${RULE}\n\n`)}\n`;
}
