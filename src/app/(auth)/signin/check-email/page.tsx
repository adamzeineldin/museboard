import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "@/components/shell/BrandMark";

export const metadata: Metadata = { title: "Check your email" };

export default function CheckEmailPage() {
  return (
    <main className="auth">
      <div className="auth-card">
        <div className="brand">
          <BrandMark />
          <b>Inroad</b>
        </div>
        <div>
          <h1>Check your email</h1>
          <p className="muted">We sent you a sign-in link. It works once and expires in 24 hours.</p>
        </div>
        <p className="muted" style={{ fontSize: ".82rem" }}>
          Wrong address? <Link href="/signin">Start over</Link>.
        </p>
      </div>
    </main>
  );
}
