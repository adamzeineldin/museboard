# Inroad architecture contract

This is the shared contract for everyone building Inroad. The product brief is `docs/reference/INROAD_BUILD.md`
and the UI prototype is `docs/reference/inroad.html`. **Read both before writing code.** If code and this file
disagree, fix one of them in the same change.

## Layout (repo root = Next.js app)

```
prisma/schema.prisma        all models (sec. 3 of the brief + Auth.js + ConnectorToken)
prisma/seed.ts              sample companies, jobs, contacts, demo user
src/app/(auth)/signin       magic-link sign-in
src/app/(app)/...           signed-in shell: jobs, campaign, activity, warm-paths, settings, onboarding
src/app/api/auth/[...nextauth]
src/app/mcp/route.ts        MCP streamable HTTP endpoint (POST/GET/DELETE /mcp)
src/app/.well-known/oauth-protected-resource/route.ts
src/lib/db.ts               Prisma client singleton
src/lib/auth.ts             Auth.js config (export auth, handlers, signIn, signOut)
src/lib/rules/              checkApplication + ISO-week helpers (pure, no DB)
src/lib/campaign/           versions, rules-in-force, plain-English summary, approve/pause/resume/revoke
src/lib/applications/       prepare, approve, skip, submit packet, record submission, weekly pass, weekCount
src/lib/matching/           embedder interface, local embedder, scoring, recomputeMatches
src/lib/resume/             upload storage + text extraction (pdf, docx, txt); zip-guard.ts caps a DOCX's unpacked size (20 MB) before mammoth
src/lib/outreach/           contacts, CSV import, draft generation, referral packet, best contact
src/lib/audit.ts            writeAudit(userId, actor, action, payload, client?)
src/lib/digest/             weekly digest builder + mailer, signed pause/unsubscribe links, Settings preference
src/lib/connector/          connector tokens (create, verify, list, revoke) + Settings actions
src/mcp/                    createInroadMcpServer({ userId, scope, now? }), tool definitions, /mcp HTTP pipeline, CLI
src/app/pause, src/app/digest/unsubscribe   signed-out pages behind the digest's signed links
scraper/                    Python package (stdlib only). `python -m scraper` prints jobs JSON. unittest in scraper/tests
worker/                     TS: run scraper, upsert jobs, close missing, recompute matches, delete expired sign-in links; node-cron schedule (6h) + weekly digest
e2e/                        Playwright: done-criteria journey, axe (WCAG 2.1 AA) in light + dark, auth (milestone 8)
```

## Conventions
- TypeScript strict. Server-only code imports `"server-only"` where it touches the DB.
- Immutable updates; small files (<400 lines typical); explicit error handling; zod validation at every boundary
  (server actions, route handlers, MCP tool inputs, CSV rows, scraper JSON).
- SQLite for local dev (`DATABASE_URL="file:./dev.db"`); schema must stay Postgres-compatible (no SQLite-only tricks).
  `DATABASE_URL` is SQLite only for now: `createPrismaClient` (`src/lib/prisma-client.ts`) throws on anything but a
  `file:` URL. Moving to Postgres is marked `TODO(postgres)` there and in `src/lib/serialized-adapter.ts`.
  Enum-like fields are `String` with the allowed values validated in TS (`src/lib/types.ts` exports the unions).
- Every application Inroad prepares writes an `AuditEvent` with the rule-check result and reason (ground rule 6).
  State changes on the consent path (campaign propose/approve/pause/resume/revoke; application prepare, approve, skip,
  submit) write their audit row with the transaction client (`writeAudit(..., tx)`), so the change and its audit commit
  or roll back together. In `src/lib/applications`, expected refusals inside those transactions return a result and are
  thrown after it resolves. Campaign services (`approveVersion`, `setCampaignStatus`) throw `CampaignError` inside the
  transaction, which rolls it back, so nothing written there before the throw (an audit row included) survives.
- One SQLite connection serves every request in a process (`PrismaBetterSqlite3`). Its own mutex only serializes
  interactive transactions, so a plain query from another request would run inside an open `BEGIN` (and vanish with its
  rollback). `src/lib/serialized-adapter.ts` wraps the adapter so top-level queries and transactions share one lock.
  Consequence: inside a `$transaction` callback use `tx`, never `db` (a `db` call there waits on itself until timeout).
- Outreach is never sent by Inroad. No feature offers rewards for referrals. Nothing scrapes social media,
  LinkedIn, Meta Careers or Google Careers. Job data comes only from Greenhouse, Lever, Ashby and Workday public job-board APIs.
- Companies with no public ATS feed (e.g. Meta, Google in the seed) have `ats = null` and are never scraped.
- Scraper failure rule: a company fails, and the ingest leaves its jobs untouched (nothing updated or closed), when the
  fetch raises or at least one posting failed and none parsed. Workday also fails a company whose listing is incomplete:
  a page comes back empty before the reported total, the first page has no usable total, the listing is cut off at
  `max_pages`, or there are more candidates than `max_details` (see `scraper/ats/workday.py`).
- Prototype classes in `src/app/styles/components.css` must not share a name with a Tailwind utility: utilities win, and
  Tailwind generates one whenever the name appears in markup (the prototype's `.ring` became `.match-ring`, `.inline`
  became `.inline-fields`). Prototype classes reused with different meanings are scoped (the campaign toggle is `.opts .co`).

## Schema additions beyond the brief (and why)
- `Job.description String?`, `Job.compensation String?`, `Job.department String?` — scoring uses title + description; cards show pay.
- `Company.name @unique`, `Company.ats String?` (null = no public feed). The unique index is case-sensitive, so every
  writer matches names with `normalizeCompanyName` (`src/lib/company-name.ts`) first: contact/CSV entry and the worker's
  ingest reuse an existing row whatever its casing, and only create one when none matches.
- `Application @@unique([userId, jobId])` — prevents duplicate applications. Extra fields: `packet Json?`, `checkResult Json?`,
  `confirmationText String?`, `decidedAt DateTime?`.
- `Outreach.companyId`, `Outreach.createdAt`, `Outreach.sentAt?`.
- `Contact.email String?`, `Contact.createdAt`.
- `CampaignVersion.approvedBy String?` (userId), index on (campaignId, createdAt).
- `ConnectorToken { id, userId, name, tokenHash @unique, scope ('read'|'write'), createdAt, lastUsedAt?, revokedAt? }`.
  The Muse panel shows Connected only for an unrevoked token that has been used (`lastUsedAt` set); an unrevoked one
  that was never used reads "Not used yet" (`src/components/shell/muse-connection.ts`).
- `User.digestOptOut Boolean @default(false)`; Auth.js `Account`, `Session`, `VerificationToken`. Auth.js only deletes a
  `VerificationToken` when its link is used, so each scheduled worker pass deletes expired rows, even when the scrape
  failed (`deleteExpiredVerificationTokens`, `src/lib/auth-cleanup.ts`).
- One active campaign per user: `Campaign.userId @unique` is NOT used; instead the service layer guarantees at most one
  campaign with status in ('active','paused') per user.

## Application lifecycle
- `prepared` — cleared to submit: either the rule check passed (`decidedBy: 'campaign'`) or the user approved it
  (`decidedBy: 'user'`, reason `Approved by you`). Holds the packet.
- `waiting` — rule check failed; the user must Approve or Skip. `reason` is the failing check's reason.
  Re-preparing a waiting row (`prepareApplication`, e.g. Muse's `prepare_application`) re-runs the check inside a
  transaction that only writes while the row is still `waiting` (a concurrent Skip/Approve wins): a pass promotes it to
  `prepared`/`campaign` with the **campaign's resume** (the version in force's `resumeId`, else the default) and a packet
  built for it; a failure with a different reason or top-choice flag updates `reason`, `checkResult` and
  `campaignVersionId` (still waiting), audits `application.prepared` (`recheck: true`) and, for a top choice, drafts the
  referral ask. The same failure again changes nothing. Rows the user approves keep their own resume.
  `prepareApplication` re-reads the campaign inside its transaction, so a pause or approval that committed after the
  first read is not missed. If the version in force then names a different resume, the resume is picked again inside the
  transaction, so `campaignVersionId` and `resumeId` always come from the same version.
- Closed postings (`Job.closedAt` set by the ingest): `prepareApplication` refuses them (`ApplicationError('closed')`,
  "This posting has closed.") whether or not a waiting row exists, `approveWaiting` refuses them, and the release check
  (`getSubmissionPacket`, `checkRelease`, `getReleaseVerdicts`) refuses every prepared row on a closed job, user-approved
  ones included, with reason `This posting has closed.`
- `submitted` — Muse called `record_submission`, or the user marked it submitted on the web. `submittedAt` set.
  `recordSubmission` (shared by both) only records a `prepared` application when (a) its packet was released for the
  current decision (`getSubmissionPacket` returned allowed and stamped `Application.packetReleasedAt`; every new
  decision resets it to null), or (b) the release check allows it right now. Muse can only submit with the packet, so a
  released packet stays recordable after a pause or a rules edit (it records a true event). Anything else throws
  `ApplicationError('not_released')` (with `reason`) and audits `application.record_refused` with the caller's actor.
  Already submitted stays idempotent. `application.submitted` records `allowedBy: 'packet_released'|'release_check'`.
  The Activity row model mirrors this gate with `recordable` (prepared, and releasable now or `packetReleased`), so a
  held row whose packet already went out still shows "Mark as submitted" while its packet stays hidden.
- `skipped` — the user skipped it.

## weekCount (cap accounting)
`weekCount(userId, now, tz)` counts this user's applications in the current ISO week (Monday 00:00 in the user's
timezone) that are **committed to go out**: `submitted` (by `submittedAt`) plus `prepared` (by `decidedAt`).
Counting `prepared` is deliberate: otherwise one weekly pass could clear 20 jobs before any is submitted and blow the cap.
The zone is `User.timezone`. Changing it in Settings takes effect at once: it moves the current ISO week window and the
day `endsOn` counts through (inclusive, in the new zone).
When re-checking a specific **campaign-prepared** application at release time (`getSubmissionPacket`, and the web via
`getReleaseVerdicts`/`checkRelease`), the count is the rows ranked ahead of it (`countAhead` in `week-count.ts`): this
week's submitted rows, every row the user approved this week, and the campaign-prepared rows decided this week before it
(by `decidedAt`, then `createdAt`, then `id`). So a user approval over the cap pushes the newest campaign-prepared row
over, never the older ones (cap 2, two campaign-prepared, the user approves a third: exactly one campaign row reads
`Weekly limit reached`). A row prepared in an earlier week goes last: it is checked against everything committed this
week, excluding itself. User-approved rows are always releasable.

## Campaign versions
- Newest version with `approvedAt` set is in force. The newest unapproved version created after it that has no
  `supersededAt` is "pending" and changes nothing.
- A version's rules are **immutable once created**. Every proposal (web Save or Approve with unsaved edits, or
  `propose_campaign`) creates a NEW version, and the previous pending version gets `supersededAt = now`. So a summary
  shown for a `versionId` always describes exactly what approving that id would put in force.
  - `rulesEqual` ignores list order and the case and spacing of names (`normalizeCompanyName`).
  - Rules equal to the current pending version: that version is returned unchanged (no churn, no `campaign.proposed`
    entry). Outcome `unchanged_pending`.
  - Rules equal to the version in force are accepted even after their end date (no new rules are written):
    - with nothing pending, a no-op that returns the version in force. Outcome `unchanged_in_force`.
    - with a version pending, that version is superseded (withdrawn), the version in force is returned, and
      `campaign.proposal_withdrawn` is audited. Outcome `withdrawn_pending`.
  - Any other rules whose end date has passed are refused ("The end date has already passed.").
- `proposeRules(userId, rules, via, now?) => { version, outcome: 'created'|'unchanged_pending'|'unchanged_in_force'|
  'withdrawn_pending', supersededVersionId }`; `proposeVersion` is the contract wrapper returning `version`.
  `campaign.proposed` records `supersededVersionId`.
- Approve = set `approvedAt` (+ `approvedVia`) on `versionId`, which must be the **current pending version**. Any other
  unapproved id (superseded, or older than the version in force) throws `CampaignError('stale_version')`: "These rules
  changed after you reviewed them. Review the latest summary and approve again." Nothing is approved.
- The web Approve form posts the `versionId` of the pending version whose summary it shows (hidden input) plus the rules
  the summary was computed from. If those rules are that version's stored rules, exactly that id is approved (stale if a
  newer proposal replaced it; the page then refreshes to the latest summary). If the form has unsaved edits, the action
  saves them as a new version and approves that new id in the same action, so what is on screen is what is approved.
- Version history labels: In force, Pending, Replaced (approved, then a newer approval), Replaced before approval
  (`supersededAt`), Never approved (legacy rows).
- Pause/Resume/Revoke change `Campaign.status`.
- Effective status: an `active` campaign whose `endsOn` has passed (in the user's zone) displays as ended in
  `get_campaign` and on the web; the stored status stays `active`. `checkApplication` already refuses it with
  "Campaign has ended".
- Revoked/ended campaigns are terminal; a new campaign starts with a fresh first version.

## Cross-module function contract (implementers must keep these signatures)
```ts
// src/lib/rules
checkApplication(job: RuleJob, match: RuleMatch | null, campaign: RuleCampaign | null, weekCount: number, now: Date)
  : { ok: boolean; reason: string; topChoice?: true }
isoWeekStart(now: Date, timeZone: string): Date   // instant of Monday 00:00 local
// src/lib/campaign
getCampaignState(userId): Promise<{ campaign, inForce: CampaignVersion|null, pending: CampaignVersion|null, rulesInForce: CampaignRules|null }>
summarizeRules(rules: CampaignRules, ctx: { resumeName: string }): string[]   // plain sentences for "What you're approving"; the end date always includes its year ("Dec 15, 2026")
proposeVersion(userId, rules, via: 'web'|'muse'): Promise<CampaignVersion>
approveVersion(userId, versionId, via: 'web'|'muse'): Promise<CampaignVersion>
setCampaignStatus(userId, status: 'active'|'paused'|'revoked'): Promise<Campaign>
// src/lib/applications
evaluateJobForUser(userId, jobId, now?): Promise<{ ok, reason, topChoice? }>   // read-only, used by the Jobs feed and find_roles
prepareApplication(userId, jobId, actor: 'user'|'inroad'|'muse', now?): Promise<Application>
approveWaiting(userId, applicationId) / skipWaiting(userId, applicationId)
getSubmissionPacket(userId, applicationId, now?): Promise<{ allowed: true, packet, applyUrl } | { allowed: false, reason }>
recordSubmission(userId, applicationId, actor, confirmationText?): Promise<Application>
runWeeklyPass(userId, actor, now?): Promise<{ submitted: string[]; waiting: string[]; referralDrafts: string[] }>
weekCount(userId, now, timeZone, excludeApplicationId?): Promise<number>
// src/lib/outreach
bestContactAt(userId, companyId): Promise<Contact|null>
createReferralAskDraft(userId, contactId, jobId?): Promise<Outreach>
draftOutreach(userId, contactId, kind: 'coffee_chat'|'referral_ask', jobId?): Promise<{ outreach, draft, packet }>
// src/lib/matching
recomputeMatches(userId): Promise<number>
// src/lib/audit
writeAudit(userId, actor: 'user'|'inroad'|'muse', action: string, payload: unknown, client: db | tx = db): Promise<void>
// added for milestones 4-6
// src/lib/matching (pure module fit-summary.ts, no server-only)
fitSummary(resumeText: string, job: { title, description, companyName }): [string, string, string]   // three short lines
// src/lib/outreach
contactsByCompany(userId): Promise<Map<string /*companyId*/, Contact[]>>   // warm-path chip + filter
buildReferralPacket(userId, jobId | null, contactId): Promise<ReferralPacket>
// src/lib/resume
getDefaultResume(userId): Promise<Resume|null>;  resumeDownloadPath(resumeId) => `/api/resumes/${id}` (auth-checked route)
```

### Contract additions recorded at the milestone 4-6 integration
Optional trailing parameters are additive; existing callers keep working.
```ts
// src/lib/campaign
loadRuleCampaign(userId, timeZone, client?): Promise<{ ruleCampaign: RuleCampaign|null, versionInForce, rules }>
  // rule-engine view of the user's NEWEST campaign whatever its status (revoked reads "Campaign is paused").
  // The Jobs feed loads it once per request and runs checkApplication per job; it must stay equal to evaluateJobForUser.
proposeVersion(userId, rules, via, now?)   approveVersion(userId, versionId, via, now?)
getCampaignHistory(userId); versionProposedBy(userId, versionId); rulesEqual(a, b); summarizeRuleParts(rules, ctx)
proposeRules(userId, rules, via, now?); findOwnVersion(userId, versionId)   // see "Campaign versions"
CampaignError (code + user-safe message)
// src/lib/applications
getSubmissionPacket(userId, applicationId, now?, actor: Actor = 'inroad')   // audits application.packet_requested
runWeeklyPass(...) => { submitted, waiting, referralDrafts, reason?, failed? }   // `submitted` = cleared to submit (prepared)
getActivity(userId, timeZone, now?, options?: { historyLimit? }); ApplicationError (code + user-safe message)
  // every waiting/prepared row is listed; submitted/skipped rows are capped (500); stats are counted over ALL rows
  // (groupBy) and `hiddenHistory` says how many history rows were left out (Activity shows a note).
  // Activity's "Weekly cap used" stat is weekCount (prepared + submitted this week); "Applied" counts submitted.
// src/lib/matching
recomputeMatches(userId, deps?: { embedder? })
// src/lib/outreach
draftOutreach(userId, contactId, kind, jobId?, actor: Actor = 'user')
createReferralAskDraft(userId, contactId, jobId?, actor: Actor = 'inroad')   // idempotent per (contact, job, referral_ask)
```
- A new campaign is created with status `paused`; its first approval sets it to `active`. `getCampaignState` only returns an
  active or paused campaign (null after a revoke).
- Extra application reason `Upload a resume first`: `Application.resumeId` is required (brief sec. 3), so preparing a job for a
  user with no resume creates **no** Application. `prepareApplication` throws `ApplicationError('no_resume')` and audits
  `application.blocked` with `{ ok: false, reason }`; `runWeeklyPass` returns `reason: 'Upload a resume first'`. This keeps
  ground rule 6 (the attempt is logged) without allowing an application row that has no resume to go out.
- Resumes used by the approved or pending campaign version, or by any Application, cannot be deleted (`Application.resumeId`
  is `onDelete: Restrict`).

## Packets (src/lib/packet-types.ts, pure types + zod, owned by milestone 5)
```ts
ReferralPacket  = { role: { jobId, title, company, url } | null, fitSummary: string[3], resume: { id, filename, downloadPath } | null }
ApplicationPacket = ReferralPacket & { applyUrl, answers: { fullName, email, school, gradYear, location? }, tailoredSummary: string,
                    notes: string[] /* fields Inroad cannot answer, e.g. work authorization: the user or Muse must ask */ }
```

## Weekly pass candidates
"New matches" for `runWeeklyPass` = open jobs (closedAt null) with a Match for the user, no Application yet,
company in `autoCompanies` or `askFirstCompanies` (compared with `normalizeCompanyName`, as `checkApplication` does),
type in `roles`, score >= `minMatch`. A posting that closes mid-pass is refused (audited `application.blocked`) and
skipped, not counted as failed. Each goes through
`prepareApplication`: ok -> `prepared`; failure (top choice, weekly limit) -> `waiting` with the reason; top choice also
creates a `referral_ask` draft for `bestContactAt` (if any, and no draft already exists for that contact+job).
Jobs outside the campaign are not turned into applications by the pass; the Jobs feed still shows their held reason
from `evaluateJobForUser`. A user clicking **Prepare** on any open job always creates an Application (prepared or waiting), provided they have a resume.

## Contract additions recorded at the milestone 7-8 integration
```ts
// src/lib/applications (release check, shared by Muse and the web)
getReleaseVerdicts(userId, now?): Promise<Map<applicationId, { allowed, reason }>>   // prepared rows only, read-only, no audit
checkRelease(userId, applicationId, now?): Promise<{ allowed, reason }>             // read-only
getSubmissionPacket(...)                                                           // same verdict, plus the packet; audits application.packet_requested; sets packetReleasedAt when allowed
recordSubmission(userId, applicationId, actor, confirmationText?, now?)            // release gate inside the service (see Application lifecycle)
approveWaiting(userId, applicationId, now?); skipWaiting(userId, applicationId, now?)   // optional now stamps decidedAt
getActivity(...).items[].release: { allowed, reason } | null                       // Activity shows a refused prepared row as "Held: <reason>"
// The Jobs card chip and find_roles use the same verdicts: a refused prepared row is "Held: <reason>" (find_roles status 'held').
// src/lib/connector
createConnectorToken(userId, name, scope) => { token /* shown once */, record }; verifyBearer(header); listTokens(userId); revokeToken(userId, id)
// src/mcp
createInroadMcpServer({ userId, scope, now? })    // read-scope tokens only get the 3 Read tools
get_campaign also returns defaultResume: { resumeId, filename } | null
// src/lib/digest
buildDigest(userId, now, config?) => { status: 'skipped', reason } | { status: 'ready', to, data, links, message: { subject, text, html } }
sendWeeklyDigests(now?, deps?) => { users, sent, skipped, failed }
inspectPauseLink / pauseCampaignFromLink, inspectUnsubscribeLink / unsubscribeFromLink (token, now?) => { status, message }
signLinkToken / verifyLinkToken                   // HMAC-SHA256, key derived from AUTH_SECRET, 14-day expiry
setDigestEnabled(userId, enabled) => { enabled, changed }   // Settings "Weekly digest" switch (User.digestOptOut)
```
Audit actions added: `muse.<tool>` (actor muse, every tool call incl. failures, non-sensitive args + summary),
`connector.token_created`, `connector.token_revoked`, `digest.sent` (actor inroad; payload weekStart, weekEnd and the
counts submitted, ready, held, waiting, referralDrafts, plus campaign; weekStart is used to skip re-sends),
`digest.sending` (actor inroad, `{ weekStart }`; the claim, written in a transaction before each send),
`digest.send_failed` (actor inroad, `{ weekStart, error }`; releases the claim so the next run retries),
`campaign.paused_via_email` (actor user, in addition to the service's `campaign.paused`), `digest.unsubscribed_via_email`,
`digest.preference_changed` (actor user, `{ enabled, via: 'settings' }`, only on a change),
`profile.updated` (actor user, `{ fields: ['timezone'], from, to }`, only on a change).

- Digest claim (`src/lib/digest/send-claim.ts`): a week is taken when it has a `digest.sent` row, or more `digest.sending`
  than `digest.send_failed` rows. So overlapping runs never send twice, and a run that crashes mid-send is not retried
  automatically (a missed digest is better than a duplicate).
- Digest "Ready to submit" applies `getReleaseVerdicts`: only prepared rows the release check allows now are listed as
  ready. Held rows (paused campaign, closed posting, over the cap) are never listed as ready: they get their own
  "Not going out right now" section with the reason, and a digest with only held rows is still sent.
- Muse panel: one row per tool call, from the `muse.<tool>` audits, shown as `inroad.<tool>`; a call whose audit payload
  has `ok: false` is marked failed.

CLI: `npm run mcp:token -- <email> [--scope read|write] [--name ...]` (prints a token once), `npm run digest:once`.
`/mcp`, `/.well-known/oauth-protected-resource`, `/pause` and `/digest/*` are public (no session); `/pause` and `/digest`
are listed in `PUBLIC_TOKEN_PREFIXES` (src/lib/protected-routes.ts).

## Profile, resumes and sign-in
- Time zone: Settings edits it with `updateTimeZoneAction` (`src/app/(app)/settings/profile-actions.ts`), which audits
  `profile.updated`. Onboarding is one-time: once the profile is complete, the onboarding action refuses a re-submission
  (redirects to `/jobs`) so it cannot rewrite the time zone.
- Resumes: at most `MAX_RESUMES_PER_USER` (10) per user; `uploadResume` throws `ResumeError('limit_reached')` past it.
- Magic links are rate limited per email (3 per 10 minutes) and per client IP (20 per 10 minutes)
  (`src/lib/auth-rate-limit.ts`, in memory, one process). Both limits apply on the sign-in action and on the Auth.js
  route (`/api/auth/...`). There is no process-wide cap, so one sender cannot lock everyone out. The client IP is the
  first `X-Forwarded-For` hop, so the per-client limit only means something behind a reverse proxy that overwrites that
  header; the per-email limit holds either way. A limited request lands on the same "check your email" page.

Packet notes (`ApplicationPacket.notes`) are worded about "the applicant", so the same line reads naturally on the web
(shown to the applicant under "Inroad leaves these to you") and to Muse (which asks them).

## Accessibility (milestone 8)
- Every page: one h1, `main` landmark, skip link, labelled controls, `aria-current` on nav, `aria-pressed` on toggles,
  `role="switch"` for the digest setting, visible `:focus-visible` ring (`--accent-ink`), `prefers-reduced-motion` honoured.
- Action results: successes in a polite `role="status"` region, errors in `role="alert"`; both regions stay mounted.
- Route states: each signed-in route has `loading.tsx` (heading + placeholders, `role="status"`) and `error.tsx`
  (heading + safe message + **Try again** calling `retry()`); `not-found.tsx` at the root and in the app shell; `global-error.tsx`.
- Contrast: `src/app/styles/contrast.test.ts` checks every text token pair at 4.5:1 and the focus ring at 3:1, light and dark.
  Token changes: light `--accent-fg` `#FFFFFF` -> `#042419` (white on the green accent was 2.67:1, now 6.17:1) and light
  `--warm` `#A35F06` -> `#965705` (warm chip 4.45:1 -> 5.10:1). Links use `color: var(--fg)` (not `inherit`, which Chrome
  keeps from the old scheme on a live theme switch) and plain text links are underlined.
- E2E runs axe (WCAG 2.0/2.1 A+AA, best practices, and target-size 24px) on every signed-in page in light and dark.
