import type { Metadata } from "next";
import { BrandMark } from "@/components/shell/BrandMark";
import { ButtonLink } from "@/components/ui";

export const metadata: Metadata = { title: "Not found" };

export default function NotFound() {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          <b>Inroad</b>
        </div>
        <div>
          <h1>Page not found</h1>
          <p className="muted">That link doesn&apos;t go anywhere in Inroad. It may have moved, or the address has a typo.</p>
        </div>
        <ButtonLink href="/jobs" variant="primary">
          Go to Inroad
        </ButtonLink>
      </div>
    </main>
  );
}
