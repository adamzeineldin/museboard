import type { HTMLAttributes } from "react";
import { cx } from "./cx";

export type ChipTone = "ok" | "hold" | "warm" | "neutral";

export interface ChipProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: ChipTone;
}

/** Status chip: ok (will auto-apply / applied), hold (waiting on you), warm (referral first), neutral. */
export function Chip({ tone = "neutral", className, ...rest }: ChipProps) {
  return <span className={cx("chip", tone, className)} {...rest} />;
}
