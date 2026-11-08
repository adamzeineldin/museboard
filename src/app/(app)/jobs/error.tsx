"use client";

import { PageError } from "@/components/states/PageError";

export default function JobsError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Jobs" scope="jobs" error={error} retry={retry} message="Jobs didn't load. Your campaign and applications are unchanged." />;
}
