import { summarizeRuleParts, type SummaryRules } from "@/lib/campaign/summary";

export interface RulesSummaryProps {
  rules: SummaryRules;
  resumeName: string;
}

/** The "What you're approving" sentences, with the agreed values in bold. */
export function RulesSummary({ rules, resumeName }: RulesSummaryProps) {
  const sentences = summarizeRuleParts(rules, { resumeName });
  return (
    <ul>
      {sentences.map((sentence, index) => (
        <li key={index}>
          {sentence.map((part, partIndex) => (part.strong ? <b key={partIndex}>{part.text}</b> : <span key={partIndex}>{part.text}</span>))}
        </li>
      ))}
    </ul>
  );
}
