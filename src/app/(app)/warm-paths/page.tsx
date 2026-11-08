import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Warm paths" };

// Placeholder from milestone 1. Milestone 6 replaces this page.
export default function WarmPathsPage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Warm paths</h1>
          <p className="muted">People you could ask, from contacts and alumni lists you connected.</p>
        </div>
      </div>
      <EmptyState title="Coming soon">This page arrives in milestone 6.</EmptyState>
    </>
  );
}
