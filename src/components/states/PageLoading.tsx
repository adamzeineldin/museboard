export interface PageLoadingProps {
  heading: string;
  /** What is loading, read to screen readers, e.g. "Loading your jobs". */
  label: string;
  rows?: number;
}

/** Route-level loading UI: the page heading plus placeholder rows. Announced once via role=status. */
export function PageLoading({ heading, label, rows = 3 }: PageLoadingProps) {
  return (
    <>
      <div className="head">
        <h1>{heading}</h1>
      </div>
      <div role="status" aria-live="polite" className="flex flex-col gap-3">
        <span className="sr-only">{label}…</span>
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="skeleton" aria-hidden="true" />
        ))}
      </div>
    </>
  );
}
