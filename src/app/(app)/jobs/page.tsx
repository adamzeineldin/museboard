import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Jobs" };

// Placeholder from milestone 1. Milestone 4 replaces this page.
export default function JobsPage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Jobs</h1>
          <p className="muted">From public company job feeds, ranked against your resume.</p>
        </div>
      </div>
      <EmptyState title="Coming soon">This page arrives in milestone 4.</EmptyState>
    </>
  );
}
