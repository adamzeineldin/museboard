import { matchLabel, matchLevel, normalizeScore } from "./match-level";
import { cx } from "./cx";

const RADIUS = 32;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export interface MatchRingProps {
  score: number;
  className?: string;
}

/** The tinted score panel from the prototype job card: ring + "Strong / Good / Fair match". */
export function MatchRing({ score, className }: MatchRingProps) {
  const value = normalizeScore(score);
  const fair = matchLevel(value) === "fair";
  const label = matchLabel(value);
  const dash = `${((value / 100) * CIRCUMFERENCE).toFixed(1)} ${CIRCUMFERENCE.toFixed(1)}`;
  return (
    <div className={cx("job-score", fair && "fair", className)} role="img" aria-label={`${value}% match, ${label}`}>
      <div className="ring">
        <svg viewBox="0 0 76 76" aria-hidden="true">
          <circle cx="38" cy="38" r={RADIUS} fill="none" stroke="var(--ring-track)" strokeWidth="7" />
          <circle
            className="v"
            cx="38"
            cy="38"
            r={RADIUS}
            fill="none"
            stroke={fair ? "var(--muted)" : "var(--accent)"}
            strokeWidth="7"
            strokeLinecap="round"
            strokeDasharray={dash}
          />
        </svg>
        <b aria-hidden="true">{value}%</b>
      </div>
      <span className="lvl" aria-hidden="true">{label}</span>
    </div>
  );
}
