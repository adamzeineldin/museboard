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
src/lib/resume/             upload storage + text extraction (pdf, docx, txt)
src/lib/outreach/           contacts, CSV import, draft generation, referral packet, best contact
src/lib/audit.ts            writeAudit(userId, actor, action, payload)
src/lib/digest/             weekly digest builder + mailer
src/mcp/                    createInroadMcpServer(userId, scope), tool definitions, token auth
scraper/                    Python package (stdlib only). `python -m scraper` prints jobs JSON. unittest in scraper/tests
worker/                     TS: run scraper, upsert jobs, close missing, recompute matches; node-cron schedule (6h) + weekly digest
e2e/                        Playwright happy path (milestone 8)
```

## Conventions
- TypeScript strict. Server-only code imports `"server-only"` where it touches the DB.
- Immutable updates; small files (<400 lines typical); explicit error handling; zod validation at every boundary
  (server actions, route handlers, MCP tool inputs, CSV rows, scraper JSON).
- SQLite for local dev (`DATABASE_URL="file:./dev.db"`); schema must stay Postgres-compatible (no SQLite-only tricks).
  Enum-like fields are `String` with the allowed values validated in TS (`src/lib/types.ts` exports the unions).
- Every application Inroad prepares writes an `AuditEvent` with the rule-check result and reason (ground rule 6).
- Outreach is never sent by Inroad. No feature offers rewards for referrals. Nothing scrapes social media,
  LinkedIn, Meta Careers or Google Careers. Job data comes only from Greenhouse, Lever, Ashby and Workday public job-board APIs.
- Companies with no public ATS feed (e.g. Meta, Google in the seed) have `ats = null` and are never scraped.

## Schema additions beyond the brief (and why)
- `Job.description String?`, `Job.compensation String?`, `Job.department String?` — scoring uses title + description; cards show pay.
- `Company.name @unique`, `Company.ats String?` (null = no public feed).
- `Application @@unique([userId, jobId])` — prevents duplicate applications. Extra fields: `packet Json?`, `checkResult Json?`,
  `confirmationText String?`, `decidedAt DateTime?`.
- `Outreach.companyId`, `Outreach.createdAt`, `Outreach.sentAt?`.
- `Contact.email String?`, `Contact.createdAt`.
- `CampaignVersion.approvedBy String?` (userId), index on (campaignId, createdAt).
- `ConnectorToken { id, userId, name, tokenHash @unique, scope ('read'|'write'), createdAt, lastUsedAt?, revokedAt? }`.
- `User.digestOptOut Boolean @default(false)`; Auth.js `Account`, `Session`, `VerificationToken`.
- One active campaign per user: `Campaign.userId @unique` is NOT used; instead the service layer guarantees at most one
  campaign with status in ('active','paused') per user.

## Application lifecycle
- `prepared` — cleared to submit: either the rule check passed (`decidedBy: 'campaign'`) or the user approved it
  (`decidedBy: 'user'`, reason `Approved by you`). Holds the packet.
- `waiting` — rule check failed; the user must Approve or Skip. `reason` is the failing check's reason.
- `submitted` — Muse called `record_submission`, or the user marked it submitted on the web. `submittedAt` set.
- `skipped` — the user skipped it.

## weekCount (cap accounting)
`weekCount(userId, now, tz)` counts this user's applications in the current ISO week (Monday 00:00 in the user's
timezone) that are **committed to go out**: `submitted` (by `submittedAt`) plus `prepared` (by `decidedAt`).
Counting `prepared` is deliberate: otherwise one weekly pass could clear 20 jobs before any is submitted and blow the cap.
When re-checking a specific application at submit time, exclude that application from the count.

## Campaign versions
- Newest version with `approvedAt` set is in force. A newer unapproved version is "pending" and changes nothing.
- Editing rules on the web or via `propose_campaign` creates (or replaces the existing) pending version.
- Approve = set `approvedAt` (+ `approvedVia`) on the pending version. Pause/Resume/Revoke change `Campaign.status`.
- Revoked/ended campaigns are terminal; a new campaign starts with a fresh first version.

## Cross-module function contract (implementers must keep these signatures)
```ts
// src/lib/rules
checkApplication(job: RuleJob, match: RuleMatch | null, campaign: RuleCampaign | null, weekCount: number, now: Date)
  : { ok: boolean; reason: string; topChoice?: true }
isoWeekStart(now: Date, timeZone: string): Date   // instant of Monday 00:00 local
// src/lib/campaign
getCampaignState(userId): Promise<{ campaign, inForce: CampaignVersion|null, pending: CampaignVersion|null, rulesInForce: CampaignRules|null }>
summarizeRules(rules: CampaignRules, ctx: { resumeName: string }): string[]   // plain sentences for "What you're approving"
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
writeAudit(userId, actor: 'user'|'inroad'|'muse', action: string, payload: unknown): Promise<void>
// added for milestones 4-6
// src/lib/matching (pure module fit-summary.ts, no server-only)
fitSummary(resumeText: string, job: { title, description, companyName }): [string, string, string]   // three short lines
// src/lib/outreach
contactsByCompany(userId): Promise<Map<string /*companyId*/, Contact[]>>   // warm-path chip + filter
buildReferralPacket(userId, jobId | null, contactId): Promise<ReferralPacket>
// src/lib/resume
getDefaultResume(userId): Promise<Resume|null>;  resumeDownloadPath(resumeId) => `/api/resumes/${id}` (auth-checked route)
```

## Packets (src/lib/packet-types.ts, pure types + zod, owned by milestone 5)
```ts
ReferralPacket  = { role: { jobId, title, company, url } | null, fitSummary: string[3], resume: { id, filename, downloadPath } | null }
ApplicationPacket = ReferralPacket & { applyUrl, answers: { fullName, email, school, gradYear, location? }, tailoredSummary: string,
                    notes: string[] /* fields Inroad cannot answer, e.g. work authorization: the user or Muse must ask */ }
```

## Weekly pass candidates
"New matches" for `runWeeklyPass` = open jobs (closedAt null) with a Match for the user, no Application yet,
company in `autoCompanies` or `askFirstCompanies`, type in `roles`, score >= `minMatch`. Each goes through
`prepareApplication`: ok -> `prepared`; failure (top choice, weekly limit) -> `waiting` with the reason; top choice also
creates a `referral_ask` draft for `bestContactAt` (if any, and no draft already exists for that contact+job).
Jobs outside the campaign are not turned into applications by the pass; the Jobs feed still shows their held reason
from `evaluateJobForUser`. A user clicking **Prepare** on any job always creates an Application (prepared or waiting).
