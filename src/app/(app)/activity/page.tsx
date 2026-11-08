import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Activity" };

// Placeholder from milestone 1. Milestone 5 replaces this page.
export default function ActivityPage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Activity</h1>
          <p className="muted">Every application Inroad prepared, and why it went out or came back to you.</p>
        </div>
      </div>
      <EmptyState title="Coming soon">This page arrives in milestone 5.</EmptyState>
    </>
  );
}
