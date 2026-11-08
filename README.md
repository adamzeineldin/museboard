# Inroad

A job-search copilot for students going after SWE internships and new-grad roles. It pairs job discovery
from public ATS job boards with a "warm path" to someone at each company, and applies only inside a
campaign the user approved. It also runs as a connector that Meta's Muse agent can call (MCP at `/mcp`).

- Product brief: [`docs/reference/INROAD_BUILD.md`](docs/reference/INROAD_BUILD.md)
- Architecture contract: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)
- UI prototype: [`docs/reference/inroad.html`](docs/reference/inroad.html)

## Stack

Next.js 16 (App Router, TypeScript strict, Tailwind 4) · Prisma 7 with SQLite locally (driver adapter
`better-sqlite3`; schema kept Postgres-compatible) · Auth.js v5 email magic link with database sessions ·
zod · Vitest · Playwright · Python scraper in `scraper/`.

## Quickstart

Requires Node 22.12+ (developed on Node 24) and Python 3.11+ for the scraper.

```bash
npm install                 # also runs `prisma generate` (client goes to src/generated/prisma)
cp .env.example .env        # then set AUTH_SECRET: npx auth secret
npm run db:push             # create dev.db from prisma/schema.prisma
npm run db:seed             # sample companies, 8 jobs, demo user demo@inroad.test with 4 contacts
npm run dev                 # http://localhost:3000
```

Sign in at `/signin`. With `EMAIL_SERVER` unset, the magic link is printed in the dev-server console and
written to `.dev-mail/last-link.txt` (and `.dev-mail/<email>.txt`). Open it to sign in. New users land on
`/onboarding` (name, school, graduation year, time zone) before the app shell. Upload a resume (Settings or
the Jobs page) to get match scores, then approve a campaign on `/campaign`.

### Environment

| Variable | Needed | What it is |
| --- | --- | --- |
| `DATABASE_URL` | yes | `file:./dev.db` locally (SQLite); a Postgres URL in production |
| `AUTH_SECRET` | yes | Auth.js secret (`npx auth secret`). Also signs the digest's pause/unsubscribe links (16+ chars) |
| `AUTH_URL` | yes | Public base URL, e.g. `http://localhost:3000` |
| `APP_URL` | production | Base URL for email links and the Muse connector (falls back to `AUTH_URL`) |
| `EMAIL_SERVER`, `EMAIL_FROM` | production | SMTP for magic links and the digest. Unset in dev: mail goes to `.dev-mail/` |
| `INROAD_DEV_MAIL=1` | optional | Allow the `.dev-mail/` fallback under `next start` (test deployments only) |
| `INROAD_STORAGE_DIR` | optional | Where uploaded resumes are stored (default `./storage`) |
| `DEV_MAIL_DIR` | optional | Override the `.dev-mail/` directory |

### Worker: job sync and the weekly digest

```bash
npm run worker              # long-running: scraper every 6 hours, weekly digest Mondays 13:00 UTC
npm run scrape:once         # one scraper run: upsert jobs, close missing ones, recompute matches
npm run digest:once         # send the weekly digest now (safe to re-run: a week already sent is skipped)
```

The scraper only reads public Greenhouse, Lever, Ashby and Workday job-board APIs (`scraper/`).

### Connect Muse (MCP)

Inroad serves an MCP server over streamable HTTP at `<APP_URL>/mcp` (stateless, JSON responses).
1. Sign in, open **Settings → Connect Muse**, name the connection, pick **Read only** or **Read and write**, and
   create a token. It is shown once; Inroad stores only its hash. Revoke it there at any time.
   From the shell (e.g. for a reviewer account): `npm run mcp:token -- demo@inroad.test --scope write`.
2. In Muse, add a connector with the server URL and send the token as `Authorization: Bearer <token>`.
3. Every tool call is logged (Activity page and the Muse panel). Approving campaign rules and releasing an
   application packet are sensitive writes that Muse confirms every time.

Tool reference, scopes, errors, rate limits and the reviewer recipe: [`docs/MCP.md`](docs/MCP.md).

### Tests

```bash
npm run typecheck && npm run lint
npm test                    # Vitest: unit + DB tests on a throwaway SQLite file per run (.test-db/)
npm run test:coverage       # with V8 coverage (overall lines >= 80%)
python3 -m unittest         # Python scraper tests (scraper/tests)
npx playwright install chromium   # once
npm run e2e                 # Playwright: journey + axe (light and dark) + auth
```

`npm run e2e` starts `next dev` on a free port against a throwaway SQLite DB (db push + seed) in a temp dir,
with mail and resume storage in that dir too; it never touches `dev.db` and makes no live network calls.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `prisma generate` then `tsc --noEmit` |
| `npm test` / `test:coverage` | Vitest, optionally with V8 coverage |
| `npm run db:push` / `db:seed` | Push the schema to `DATABASE_URL`; idempotent sample data |
| `npm run worker` / `scrape:once` / `digest:once` | Scheduled worker; one scraper run; one digest run |
| `npm run mcp:token -- <email>` | Mint a Muse connector token for an existing account (printed once) |
| `npm run e2e` | Playwright journey, axe and auth specs on a throwaway DB |

## Weekly digest email

Every Monday at 13:00 UTC the worker emails each user a digest of their ISO week that just ended (in their
time zone): what went out, what's ready to submit, what's waiting on them and why, the referral drafts
Inroad created (which it never sends), and the campaign status with the weekly count against the cap.
Users with nothing to report and no active campaign, and users who turned it off, get nothing. A week that
was already sent is skipped, so re-running is safe.

With `EMAIL_SERVER` unset (dev), each digest is written to `.dev-mail/digest-<userId>.html` and `.txt`.
Links point at `APP_URL` (falls back to `AUTH_URL`) and are signed with `AUTH_SECRET`. The email carries two
one-click links that work signed out and expire after 14 days: **Pause campaign** (`/pause?token=...`) and
**Stop these emails** (`/digest/unsubscribe?token=...`). Opening either page changes nothing; the change
happens only when the user presses the button on it, so mail scanners that prefetch links are harmless.
Users can turn the digest back on (or off) under **Settings → Weekly digest**.

## Layout

```
prisma/              schema.prisma, seed.ts, seed-data.ts
src/app/(auth)/      sign-in and check-email pages
src/app/onboarding/  first-run profile form
src/app/(app)/       signed-in shell (rail, Muse activity panel) and pages
src/components/ui/   Button, Chip, Tag, Pill, Panel, MatchRing, EmptyState, ErrorState
src/components/shell/ nav rail, campaign card, Muse panel, shell data loader
src/lib/             db, auth, audit, types, profile, and the domain modules (campaign, applications, ...)
src/proxy.ts         optimistic auth redirect (Next 16 "proxy", formerly middleware)
src/test/            Vitest global setup and DB helpers
e2e/                 Playwright specs
scraper/, worker/    Python scraper and the TS worker that runs it
```

## Ground rules

1. **No scraping of social media or personal data.** Jobs come only from public ATS job-board APIs (Greenhouse,
   Lever, Ashby, Workday). Contacts come only from manual entry or a CSV the user exported themselves.
2. **Consent is explicit and visible.** Inroad applies only inside a campaign the user approved, and its consent
   sits on top of Muse's own permission prompts.
3. **Changes need a new yes.** Editing approved rules creates a pending version; the approved one stays in force.
4. **Outreach is never sent automatically.** Inroad drafts; the user sends and marks it sent.
5. **No paid referrals.**
6. **Everything is logged.** Every application has an audit trail with the rule-check result and reason.

An application is released (packet + apply link, on the web or to Muse) only if the rule check passes right
now or the user approved it; the web and `submit_application` share the same check.

## Known TODO(muse-docs)

Meta's public Muse docs (read 2026-11-07, see [`docs/MUSE_CONNECTOR_NOTES.md`](docs/MUSE_CONNECTOR_NOTES.md))
don't confirm these yet; each is marked `TODO(muse-docs)` in code or [`docs/MCP.md`](docs/MCP.md):

- Transport (streamable HTTP vs SSE) and whether Muse expects a specific endpoint path.
- Muse's OAuth flow (authorization server, OAuth 2.1 / PKCE, dynamic client registration, redirect URIs, scope
  names). Until then `authorization_servers` is `[]` in `/.well-known/oauth-protected-resource` and tokens come
  from Settings.
- Whether Muse reads MCP annotations (`readOnlyHint`, `destructiveHint`) or only the submission form.
- Required error format and rate-limit expectations (Inroad returns JSON-RPC errors and allows 60 calls/min/token,
  in memory per instance: `TODO(scale)`).
- Whether Muse fetches the resume file in the packet: `packet.resume.downloadPath` needs a web session, not the
  connector token.
- The submission form (behind login): data-processing questionnaire, support and security contacts, terms links.
