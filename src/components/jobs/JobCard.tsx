import { ButtonLink, Chip, MatchRing, Tag } from "@/components/ui";
import type { PrepareActionResult } from "@/app/(app)/jobs/prepare-message";
import type { JobCardModel } from "./job-view-model";
import { PrepareButton } from "./PrepareButton";

export interface JobCardProps {
  card: JobCardModel;
  hasResume: boolean;
  prepare: (jobId: string) => Promise<PrepareActionResult>;
}

const domId = (jobId: string): string => `job-${jobId.replace(/[^A-Za-z0-9_-]/g, "-")}`;

function NoScore({ hasResume }: { hasResume: boolean }) {
  return (
    <div className="job-score fair">
      <span className="text-[.8rem] text-muted px-2">
        {hasResume ? "Match score pending. It appears after the next job sync." : "Upload a resume to see match scores"}
      </span>
    </div>
  );
}

/** Large rounded job card from the prototype: details on the left, match ring panel on the right. */
export function JobCard({ card, hasResume, prepare }: JobCardProps) {
  const titleId = `${domId(card.id)}-title`;
  const jobLabel = `${card.title} at ${card.companyName}`;
  return (
    <article className="job" aria-labelledby={titleId}>
      <div className="job-main">
        <div className="job-top">
          <div className="logo" aria-hidden="true">
            {card.companyInitials}
          </div>
          <div className="min-w-0">
            <div className="font-bold">{card.companyName}</div>
            <div className="posted">
              {card.postedLabel} · <span className="mono">{card.source}</span>
            </div>
          </div>
        </div>
        <h3 id={titleId}>
          {card.postingUrl ? (
            <a href={card.postingUrl} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline">
              {card.title}
              <span className="sr-only"> (opens the posting in a new tab)</span>
            </a>
          ) : (
            card.title
          )}
        </h3>
        <div className="tags">
          {card.tags.map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </div>
        {card.skills.length > 0 ? (
          <p className="text-[.82rem] text-muted">
            Matches your resume on <span className="font-semibold text-fg">{card.skills.join(", ")}</span>
          </p>
        ) : null}
        <div className="job-foot">
          <div className="chips">
            <Chip tone={card.chip.tone}>{card.chip.label}</Chip>
            {card.warmPath ? <Chip tone="warm">{card.warmPath.label}</Chip> : null}
          </div>
          <div className="actions">
            {card.warmPath ? (
              <ButtonLink href={card.warmPath.referralHref} variant="ghost" size="small">
                Ask for referral<span className="sr-only"> for {jobLabel}</span>
              </ButtonLink>
            ) : null}
            {card.applicationStatus === "submitted" || card.applicationStatus === "prepared" ? null : (
              <PrepareButton jobId={card.id} jobLabel={jobLabel} prepare={prepare} />
            )}
          </div>
        </div>
      </div>
      {card.score === null ? <NoScore hasResume={hasResume} /> : <MatchRing score={card.score} />}
    </article>
  );
}
