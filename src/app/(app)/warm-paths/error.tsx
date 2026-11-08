"use client";

import { PageError } from "@/components/states/PageError";

export default function WarmPathsError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Warm paths" scope="warm-paths" error={error} retry={retry} message="Warm paths didn't load. Your contacts and drafts are unchanged." />;
}
