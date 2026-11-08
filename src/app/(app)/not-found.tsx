import { ButtonLink, EmptyState } from "@/components/ui";

export default function AppNotFound() {
  return (
    <>
      <div className="head">
        <h1>Not found</h1>
      </div>
      <EmptyState
        title="We couldn't find that page"
        action={
          <ButtonLink href="/jobs" variant="primary" size="small">
            Go to Jobs
          </ButtonLink>
        }
      >
        It may have moved, or the link is out of date.
      </EmptyState>
    </>
  );
}
