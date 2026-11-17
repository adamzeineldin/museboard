"use client";

import { PageError } from "@/components/states/PageError";

export default function CampaignError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Rules" scope="campaign" error={error} retry={retry} message="Your campaign didn't load. The approved rules are still in force." />;
}
