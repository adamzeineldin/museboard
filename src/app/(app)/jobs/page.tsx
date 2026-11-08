import type { Metadata } from "next";
import { FeedBanners } from "@/components/jobs/FeedBanners";
import { JobCard } from "@/components/jobs/JobCard";
import { JobFilters } from "@/components/jobs/JobFilters";
import { JobsToastProvider } from "@/components/jobs/JobsToast";
import { ResumePrompt } from "@/components/jobs/ResumePrompt";
import { loadJobsFeed } from "@/components/jobs/feed-data";
import { emptyFeedCopy, feedHeader, parseJobFilter, parseShowLimit, showMoreHref } from "@/components/jobs/job-view-model";
import { ButtonLink, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/current-user";
import { uploadResumeAction } from "../settings/actions";
import { prepareJobAction } from "./actions";

export const metadata: Metadata = { title: "Jobs" };

interface JobsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const filter = parseJobFilter(params.filter);
  const limit = parseShowLimit(params.show);
  const user = await requireUser();
  const feed = await loadJobsFeed({ id: user.id, timezone: user.timezone }, { filter, limit });
  const header = feedHeader(feed.newMatchCount, feed.totalOpen, feed.resume?.filename ?? null);
  const empty = emptyFeedCopy(filter, { contactsAvailable: feed.contactsAvailable });

  return (
    <JobsToastProvider>
      <div className="head">
        <div>
          <h1>{header.title}</h1>
          <p className="muted">
            {header.subtitle}
            {header.resumeName ? (
              <>
                {" "}
                <b className="text-fg">{header.resumeName}</b>.
              </>
            ) : null}
          </p>
        </div>
      </div>

      {feed.resume ? null : <ResumePrompt action={uploadResumeAction} />}
      <FeedBanners rulesAvailable={feed.rulesAvailable} contactsAvailable={feed.contactsAvailable} />

      <JobFilters active={filter} />

      {feed.cards.length === 0 ? (
        <EmptyState
          title={empty.title}
          action={
            empty.addContacts ? (
              <ButtonLink href="/warm-paths" size="small" variant="primary">
                Add contacts
              </ButtonLink>
            ) : null
          }
        >
          {empty.body}
        </EmptyState>
      ) : (
        <section className="feed" aria-labelledby="feed-title">
          <h2 id="feed-title" className="sr-only">
            Job matches
          </h2>
          {feed.cards.map((card) => (
            <JobCard key={card.id} card={card} hasResume={feed.resume !== null} prepare={prepareJobAction} />
          ))}
        </section>
      )}

      {feed.cards.length > 0 ? (
        <div className="flex flex-wrap items-center gap-3 text-[.85rem] text-muted">
          <span>
            Showing {feed.cards.length} of {feed.totalFiltered}
          </span>
          {feed.hasMore ? (
            <ButtonLink href={showMoreHref(filter, feed.nextLimit)} size="small" scroll={false}>
              Show more
            </ButtonLink>
          ) : null}
        </div>
      ) : null}
    </JobsToastProvider>
  );
}
