"use client";

import { PageError } from "@/components/states/PageError";

export default function SettingsError({ error, retry }: { error: unknown; retry: () => void }) {
  return <PageError heading="Settings" scope="settings" error={error} retry={retry} message="Settings didn't load. Nothing was changed." />;
}
