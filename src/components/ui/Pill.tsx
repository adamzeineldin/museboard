import type { ButtonHTMLAttributes } from "react";
import { cx } from "./cx";

export interface PillProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  pressed: boolean;
}

/** Filter pill (toggle button). Pressed state is exposed through aria-pressed. */
export function Pill({ pressed, className, type = "button", ...rest }: PillProps) {
  return <button type={type} aria-pressed={pressed} className={cx("pill", className)} {...rest} />;
}
