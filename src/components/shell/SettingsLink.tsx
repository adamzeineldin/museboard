"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { isCurrentPath } from "./nav-items";

export function SettingsLink() {
  const pathname = usePathname();
  return (
    <Link href="/settings" aria-current={isCurrentPath(pathname, "/settings") ? "page" : undefined}>
      Settings
    </Link>
  );
}
