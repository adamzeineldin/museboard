"use client";

import { PageError } from "@/components/states/PageError";

export default function ActivityError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Pipeline" scope="activity" error={error} retry={retry} message="Your pipeline didn't load. Nothing was submitted or changed." />;
}
