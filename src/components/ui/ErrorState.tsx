import type { ReactNode } from "react";
import { cx } from "./cx";

export interface ErrorStateProps {
  title?: string;
  message?: string;
  action?: ReactNode;
  className?: string;
}

/** User-facing error block. Never put stack traces or internal details in `message`. */
export function ErrorState({ title = "Something went wrong", message, action, className }: ErrorStateProps) {
  return (
    <div className={cx("error-state", className)} role="alert">
      <b>{title}</b>
      {message ? <p className="muted">{message}</p> : null}
      {action}
    </div>
  );
}
