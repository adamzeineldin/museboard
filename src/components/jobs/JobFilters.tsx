"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Pill } from "@/components/ui";
import { filterHref, JOB_FILTERS, type JobFilter } from "./job-view-model";

/** Filter pills. The choice lives in ?filter= so a filtered feed is linkable. */
export function JobFilters({ active }: { active: JobFilter }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <div className="filters" role="group" aria-label="Filter jobs" aria-busy={pending || undefined}>
      {JOB_FILTERS.map(({ value, label }) => (
        <Pill
          key={value}
          pressed={active === value}
          onClick={() => startTransition(() => router.push(filterHref(value), { scroll: false }))}
        >
          {label}
        </Pill>
      ))}
    </div>
  );
}
