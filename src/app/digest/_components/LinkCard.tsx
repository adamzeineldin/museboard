import type { ReactNode } from "react";
import { BrandMark } from "@/components/shell/BrandMark";

// Signed-out page frame for the digest's email links (same card as the sign-in pages).

export interface LinkCardProps {
  title: string;
  children: ReactNode;
}

export function LinkCard({ title, children }: LinkCardProps) {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          <b>Inroad</b>
        </div>
        <h1>{title}</h1>
        {children}
      </div>
    </main>
  );
}

type SearchParams = Record<string, string | string[] | undefined>;

/** The single `token` query value, or "" (an empty token is reported as an invalid link). */
export function tokenParam(params: SearchParams): string {
  const value = params.token;
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/** Keep the token out of Referer headers and the page out of search engines. */
export const LINK_PAGE_METADATA = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
} as const;
