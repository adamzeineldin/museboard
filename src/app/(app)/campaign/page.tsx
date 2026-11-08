import type { Metadata } from "next";
import { CampaignForm } from "@/components/campaign/CampaignForm";
import { formatDateTime } from "@/components/campaign/format";
import { listCompanies } from "@/components/campaign/form-model";
import { VersionHistory, type VersionHistoryRow } from "@/components/campaign/VersionHistory";
import { getCampaignHistory, getCampaignState, type VersionHistoryEntry } from "@/lib/campaign";
import { consentStatus } from "@/lib/campaign/ended";
import { requireUser } from "@/lib/current-user";
import { db } from "@/lib/db";
import { addDaysToIsoDate, localDateString } from "@/lib/rules";
import { campaignStatusSchema, parseCampaignRules } from "@/lib/types";

export const metadata: Metadata = { title: "Campaign" };

const DEFAULT_CAMPAIGN_DAYS = 42;

const STATE_LABEL: Record<VersionHistoryEntry["state"], string> = {
  in_force: "In force",
  pending: "Pending",
  superseded: "Replaced",
  replaced: "Replaced before approval",
  unapproved: "Never approved",
};

const proposerName = (actor: VersionHistoryEntry["proposedBy"]): string =>
  actor === "muse" ? "Muse" : actor === "user" ? "you" : "someone";

function historyRow(entry: VersionHistoryEntry, timeZone: string): VersionHistoryRow {
  const detail = entry.approvedAt
    ? `Approved ${formatDateTime(entry.approvedAt, timeZone)} ${entry.approvedVia === "muse" ? "through Muse" : "on the web"}`
    : `Proposed by ${proposerName(entry.proposedBy)} ${formatDateTime(entry.createdAt, timeZone)}, not approved`;
  return { id: entry.id, number: entry.number, stateLabel: STATE_LABEL[entry.state], detail };
}

function pendingNote(entry: VersionHistoryEntry | undefined, timeZone: string): string | null {
  if (!entry) return null;
  const when = formatDateTime(entry.createdAt, timeZone);
  if (entry.proposedBy === "muse") {
    return `Muse proposed these rules (${when}). They're pending: nothing changes until you approve them.`;
  }
  return `You saved these rules (${when}) without approving them. They're pending until you do.`;
}

export default async function CampaignPage() {
  const user = await requireUser();
  const [state, history, resumes, openCompanies] = await Promise.all([
    getCampaignState(user.id),
    getCampaignHistory(user.id),
    db.resume.findMany({
      where: { userId: user.id },
      orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
      select: { id: true, filename: true },
    }),
    db.company.findMany({ where: { jobs: { some: { closedAt: null } } }, select: { name: true } }),
  ]);

  const pendingRules = state.pending ? parseCampaignRules(state.pending.rules) : null;
  const now = new Date();
  const today = localDateString(now, user.timezone);
  const status = state.inForce ? campaignStatusSchema.catch("paused").parse(state.campaign?.status) : null;
  // An active campaign whose end date has passed reads "Ended" (nothing more is prepared under it).
  const liveStatus = consentStatus(status, state.rulesInForce?.endsOn ?? null, now, user.timezone);

  return (
    <>
      <div className="head">
        <div>
          <h1>Internship campaign</h1>
          <p className="muted">Approve these rules once. Inroad applies within them and brings everything else back to you.</p>
        </div>
      </div>
      <CampaignForm
        companies={listCompanies(
          openCompanies.map((company) => company.name),
          [state.rulesInForce, pendingRules],
        )}
        resumes={resumes}
        inForce={state.rulesInForce}
        pending={pendingRules}
        pendingVersionId={pendingRules ? (state.pending?.id ?? null) : null}
        pendingNote={pendingNote(history.find((entry) => entry.state === "pending"), user.timezone)}
        status={liveStatus}
        approvedLabel={state.inForce?.approvedAt ? `Approved ${formatDateTime(state.inForce.approvedAt, user.timezone)}` : null}
        defaults={{ resumeId: resumes[0]?.id ?? "", endsOn: addDaysToIsoDate(today, DEFAULT_CAMPAIGN_DAYS) }}
        minEndsOn={addDaysToIsoDate(today, 1)}
      />
      <VersionHistory rows={history.map((entry) => historyRow(entry, user.timezone))} />
    </>
  );
}
