import type { ReactNode } from "react";
import { cx } from "./cx";

export interface EmptyStateProps {
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  /** Wrap in the list surface (default) or render bare inside another container. */
  framed?: boolean;
  className?: string;
}

export function EmptyState({ title, children, action, framed = true, className }: EmptyStateProps) {
  const body = (
    <div className={cx("empty", !framed && className)}>
      {title ? <b>{title}</b> : null}
      {children ? <p>{children}</p> : null}
      {action}
    </div>
  );
  return framed ? <div className={cx("list", className)}>{body}</div> : body;
}
