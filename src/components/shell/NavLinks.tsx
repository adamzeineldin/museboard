"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NAV_ITEMS, isCurrentPath } from "./nav-items";

export interface NavLinksProps {
  waitingCount: number;
}

export function NavLinks({ waitingCount }: NavLinksProps) {
  const pathname = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {NAV_ITEMS.map((item) => {
        const badge = item.badgeKey === "waiting" && waitingCount > 0 ? waitingCount : null;
        return (
          <Link key={item.href} href={item.href} aria-current={isCurrentPath(pathname, item.href) ? "page" : undefined}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {item.icon}
            </svg>
            {item.label}
            {badge ? (
              <span className="n" aria-label={`${badge} waiting on you`}>
                {badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
