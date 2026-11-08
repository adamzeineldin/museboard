# Inroad: build brief

You are building **Inroad**, a job-search copilot for students going after SWE internships and new-grad roles. It works as a standalone web app and as a connector that Meta's Muse agent can call. The core idea is that referrals and warm introductions matter more than mass applying, so the app pairs job discovery with a "warm path" to someone at each company.

Two reference files may sit next to this brief. If they're present, read them before writing code:

- `inroad.html` is a clickable prototype of the UI and the campaign flow. Match its look and behavior.
- `inroad-scraper/` is a working Python job scraper with tests. Reuse it rather than rewriting it.

---

## 1. Ground rules (do not break these)

1. **No scraping of social media or personal data.** Job data comes only from public ATS job-board APIs (Greenhouse, Lever, Ashby, Workday). Do not scrape Instagram, LinkedIn, Meta Careers or Google Careers.
2. **Consent is explicit and visible.** Inroad applies on a user's behalf only inside a *campaign* the user approved. Never build anything that hides actions from Muse or routes around Muse's own permission prompts. Inroad's consent sits on top of Muse's; it doesn't replace it.
3. **Changes need a new yes.** Any edit to campaign rules creates a pending version. The previously approved version stays in force until the user approves the new one.
4. **Outreach is never sent automatically.** Inroad drafts referral and coffee-chat messages. The user sends them from their own account.
5. **No paid referrals.** No feature offers money or rewards for referrals.
6. **Everything is logged.** Every application Inroad prepares gets an audit entry with the rule-check result and the reason.

---

## 2. Stack

Use these unless the repo already has something else:

- **Web:** Next.js (App Router) + TypeScript + Tailwind
- **DB:** Postgres via Prisma (SQLite for local dev is fine)
- **Auth:** Auth.js with email magic link
- **Scraper:** the existing Python scraper, run as a scheduled worker that writes into the DB (cron, or a queue such as BullMQ if you add Redis)
- **Muse connector:** an MCP server using the official TypeScript MCP SDK, over streamable HTTP, in the same repo (`/mcp`)
- **Tests:** Vitest for TS, the existing unittest suite for Python

---

## 3. Data model

```
User            id, email, name, school, gradYear, timezone
Resume          id, userId, filename, storageKey, parsedText, createdAt, isDefault
Company         id, name, ats ('greenhouse'|'lever'|'ashby'|'workday'), atsConfig JSON
Job             id (stable "<ats>:<company>:<postingId>"), companyId, title, location,
                type ('intern'|'newgrad'), postedAt?, url, source, firstSeenAt, closedAt?
Match           userId, jobId, score 0-100, reasons JSON          -- unique(userId, jobId)
Campaign        id, userId, status ('active'|'paused'|'revoked'|'ended')
CampaignVersion id, campaignId, rules JSON, approvedAt?, approvedVia ('web'|'muse'), createdAt
                -- the newest version with approvedAt set is the one in force
Application     id, userId, jobId, campaignVersionId?, resumeId,
                status ('prepared'|'waiting'|'submitted'|'skipped'),
                decidedBy ('campaign'|'user'), reason, createdAt, submittedAt?
Contact         id, userId, name, role, companyId, relationship, source ('manual'|'csv'|'alumni-list'), notes
Outreach        id, userId, contactId, jobId?, kind ('coffee_chat'|'referral_ask'), draft, status ('draft'|'sent_by_user')
AuditEvent      id, userId, actor ('user'|'inroad'|'muse'), action, payload JSON, createdAt
```

Campaign rules JSON:

```json
{
  "roles": ["intern"],
  "autoCompanies": ["Stripe", "Datadog", "Capital One", "Cloudflare", "Ramp"],
  "askFirstCompanies": ["Meta", "Google"],
  "resumeId": "res_123",
  "weeklyCap": 5,
  "minMatch": 75,
  "endsOn": "2026-12-15"
}
```

---

## 4. The rule check (the heart of the product)

Put this in a pure function, `checkApplication(job, match, campaign, weekCount, now) → { ok, reason, topChoice? }`. Run the checks in this order and return the first failure:

1. No approved campaign version → `No approved campaign yet`
2. Campaign paused or revoked → `Campaign is paused`
3. `now` is after `endsOn` → `Campaign has ended`
4. Company is in `askFirstCompanies` → `Top choice: referral first` (`topChoice: true`)
5. Company is not in `autoCompanies` → `Not on your company list`
6. `job.type` is not in `roles` → `Role type not in campaign`
7. `match.score < minMatch` → `Match below N%`
8. `weekCount >= weeklyCap` → `Weekly limit reached`
9. Otherwise → `{ ok: true, reason: 'Fits campaign rules' }`

`weekCount` counts applications submitted (by the campaign or approved by the user) in the current ISO week, in the user's timezone.

Unit-test every branch, plus the "edited but not re-approved" case: the old version keeps governing.

When a check fails with `topChoice`, also create an `Outreach` draft (`referral_ask`) for the best contact at that company, if one exists.

---

## 5. Features

### 5.1 Job discovery
- A worker runs the scraper every 6 hours and upserts `Job` rows. A posting that's missing from a later run gets `closedAt` set.
- Match scoring v1: an embedding similarity between the resume text and the job title plus description, scaled to 0–100, with a keyword boost for skills. Store `reasons` (top matched skills) to show on the card.
- Jobs page: a filterable feed (Recommended / Internships / New grad / Has a warm path). Each card shows the company, posted time, source, tags, a match ring labeled Strong (≥85), Good (≥78) or Fair, a status chip from the rule check, and a warm-path chip.

### 5.2 Campaign
- A form for role types, companies (each one cycles auto → ask first → skip), resume, weekly cap, min match and end date.
- A live "What you're approving" summary in plain sentences, generated from the rules.
- Approve, Pause, Resume, Revoke. Editing after approval shows a banner: "You changed the rules. Inroad keeps using the version you approved until you approve this one."

### 5.3 Activity
- Stats: applied this week / cap, waiting on you, applied, skipped.
- A list sorted with waiting items first. Waiting items get Approve and Skip buttons.
- A weekly digest email: what went out, what's waiting, and a pause link.

### 5.4 Warm paths
- Contacts come from manual entry or CSV import (for example, an alumni list the user exports themselves). Nothing is scraped.
- "Draft ask" generates a coffee-chat or referral message (short, specific, with an easy out) plus a referral packet: role link, a three-line fit summary, and the resume.
- A Copy button. A "Mark as sent" toggle for the user to set themselves.

### 5.5 Submitting applications
Public ATS APIs don't accept applications from candidates, so v1 "submit" means:
1. Inroad prepares everything: the resume file, answers to common fields, and a tailored summary.
2. Through Muse, the `submit_application` tool returns the prepared packet and the application URL. Muse's own browser agent fills in the form, under Muse's own controls.
3. Muse calls `record_submission` when it's done, and the `Application` row moves to `submitted`.

On the web app without Muse, show the packet plus an "Open application" link, and let the user mark it submitted.

---

## 6. Muse connector (MCP server)

Expose these tools. Each one takes the authenticated user from the connector's OAuth token, never from a tool argument.

| Tool | Input | Output | Side effects |
|---|---|---|---|
| `find_roles` | `{ type?, company?, newOnly? }` | jobs with match score, status, warm-path flag | none |
| `find_warm_path` | `{ company }` | contacts at that company | none |
| `draft_outreach` | `{ contactId, jobId?, kind }` | draft text + packet | creates an `Outreach` draft |
| `get_campaign` | `{}` | rules in force, pending version, plain-English summary | none |
| `propose_campaign` | `{ rules }` | summary to show the user, `versionId` | creates an unapproved version |
| `approve_campaign` | `{ versionId }` | confirmation | approves the version (`approvedVia: 'muse'`). Muse must show the summary from `propose_campaign` and get a yes first. Say so in the tool description. |
| `prepare_application` | `{ jobId }` | rule-check result + packet | creates an `Application` (`prepared` or `waiting`) |
| `submit_application` | `{ applicationId }` | packet + apply URL, **only if** the rule check passes right now (or the user approved this one) | none until recorded |
| `record_submission` | `{ applicationId, confirmationText? }` | ok | marks it `submitted`, writes an audit entry |
| `run_weekly_pass` | `{}` | summary: submitted / waiting / referral drafts | runs `prepare_application` for new matches |

Tool descriptions should be plain and accurate about side effects, so Muse can explain them to the user.

Before wiring up connector registration, read Meta's current Muse Connector developer documentation for auth, review requirements and transport. Don't guess at their API. Leave clear TODOs wherever the docs are needed.

---

## 7. UI direction

Follow `inroad.html`: a bright, clean app shell with a left nav rail (Jobs, Campaign, Activity, Warm paths) and a campaign status card at the bottom of the rail. The job feed uses large rounded cards with the match ring in a tinted panel on the right. On wide screens a Muse activity panel is docked on the right. It must work at phone width, and it must support dark mode through CSS variables. Use the font Plus Jakarta Sans and a green accent. Don't copy any other company's logo or branding.

---

## 8. Milestones

Do these in order. Commit after each one with tests passing.

1. **Scaffold**: Next.js app, Prisma schema, auth, seed script with sample jobs and contacts.
2. **Scraper → DB**: wrap the Python scraper as a worker that upserts jobs, with a scheduled run.
3. **Rule engine**: `checkApplication` plus full unit tests.
4. **Jobs page + matching**: resume upload, text extraction, scoring, the feed UI.
5. **Campaign + Activity**: versioned approval flow, the activity list, approve and skip actions.
6. **Warm paths**: contacts, CSV import, outreach drafts, packet.
7. **MCP server**: all tools from section 6, with integration tests that call them through an MCP client.
8. **Digest + polish**: weekly email, empty states, error states, accessibility pass.

## 9. Done means

- `npm test` and `python -m unittest` both pass.
- A new user can sign up, upload a resume, approve a campaign, and see jobs labeled correctly as "will auto-apply", "referral first", or held with a reason.
- Editing an approved campaign doesn't change behavior until it's re-approved.
- Every application has an audit trail explaining why it went out or didn't.
- The MCP server lists all tools, and `submit_application` refuses anything the rule check rejects.
