import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** Small muted label, e.g. location, "Internship", pay. */
export function Tag({ className, ...rest }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cx("tag", className)} {...rest} />;
}
