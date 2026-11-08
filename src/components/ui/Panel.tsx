import type { HTMLAttributes } from "react";
import { cx } from "./cx";

/** Rounded surface card used for forms and detail panes. */
export function Panel({ className, ...rest }: HTMLAttributes<HTMLElement>) {
  return <section className={cx("panel", className)} {...rest} />;
}
