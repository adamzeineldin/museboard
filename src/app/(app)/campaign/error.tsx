"use client";

import { PageError } from "@/components/states/PageError";

export default function CampaignError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Internship campaign" scope="campaign" error={error} retry={retry} message="Your campaign didn't load. The approved rules are still in force." />;
}
