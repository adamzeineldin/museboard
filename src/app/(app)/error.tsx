"use client";

import { PageError } from "@/components/states/PageError";

// Fallback for any signed-in page without its own error.tsx.
export default function AppError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Inroad" scope="app" error={error} retry={retry} />;
}
