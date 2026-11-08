import type { Metadata } from "next";
import { EmptyState } from "@/components/ui";

export const metadata: Metadata = { title: "Campaign" };

// Placeholder from milestone 1. Milestone 5 replaces this page.
export default function CampaignPage() {
  return (
    <>
      <div className="head">
        <div>
          <h1>Campaign</h1>
          <p className="muted">Approve these rules once. Inroad applies within them and brings everything else back to you.</p>
        </div>
      </div>
      <EmptyState title="Coming soon">This page arrives in milestone 5.</EmptyState>
    </>
  );
}
