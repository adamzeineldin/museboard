import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cx } from "./cx";

export type ButtonVariant = "default" | "primary" | "ghost";
export type ButtonSize = "default" | "small";

interface ButtonStyleProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export function buttonClass({ variant = "default", size = "default" }: ButtonStyleProps, extra?: string): string {
  return cx("btn", variant !== "default" && variant, size === "small" && "small", extra);
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonStyleProps;

export function Button({ variant, size, className, type = "button", ...rest }: ButtonProps) {
  return <button type={type} className={buttonClass({ variant, size }, className)} {...rest} />;
}

export type ButtonLinkProps = ComponentProps<typeof Link> & ButtonStyleProps;

/** A link styled as a button (e.g. "Set up", "Open application"). */
export function ButtonLink({ variant, size, className, ...rest }: ButtonLinkProps) {
  return <Link className={buttonClass({ variant, size }, className)} {...rest} />;
}
