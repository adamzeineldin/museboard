import type { ReactNode } from "react";

export interface NavItem {
  href: string;
  label: string;
  icon: ReactNode;
  badgeKey?: "waiting";
}

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.8 } as const;

// Order follows the Legwork sidebar: Pipeline, Jobs, Rules, then Warm paths and Settings.
// Icons are Lucide-style strokes; they only show in the phone tab bar.
export const NAV_ITEMS: NavItem[] = [
  {
    href: "/activity",
    label: "Pipeline",
    badgeKey: "waiting",
    icon: <path d="M4 5h4v14H4zM10 5h4v9h-4zM16 5h4v6h-4z" {...stroke} strokeLinejoin="round" />,
  },
  {
    href: "/jobs",
    label: "Jobs",
    icon: <path d="M4 8h16v11H4zM9 8V5h6v3" {...stroke} strokeLinejoin="round" />,
  },
  {
    href: "/campaign",
    label: "Rules",
    icon: <path d="M4 7h10M18 7h2M4 17h4M12 17h8M14 4v6M8 14v6" {...stroke} strokeLinecap="round" />,
  },
  {
    href: "/warm-paths",
    label: "Warm paths",
    icon: (
      <>
        <circle cx="9" cy="9" r="3.2" {...stroke} />
        <path
          d="M3.5 19c.8-3 3-4.5 5.5-4.5s4.7 1.5 5.5 4.5M16 6.5a3 3 0 0 1 0 5.5M17.5 14.6c1.6.6 2.6 2 3 4.4"
          {...stroke}
          strokeLinecap="round"
        />
      </>
    ),
  },
  {
    href: "/settings",
    label: "Settings",
    icon: (
      <>
        <circle cx="12" cy="12" r="3" {...stroke} />
        <path
          d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"
          {...stroke}
          strokeLinecap="round"
        />
      </>
    ),
  },
];

export function isCurrentPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
