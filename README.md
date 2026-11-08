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

Requires Node 22.12+ (developed on Node 24).

```bash
npm install                 # also runs `prisma generate` (client goes to src/generated/prisma)
cp .env.example .env        # then set AUTH_SECRET: npx auth secret
npm run db:push             # create dev.db from prisma/schema.prisma
npm run db:seed             # sample companies, 8 jobs, demo user demo@inroad.test with 4 contacts
npm run dev                 # http://localhost:3000
```

Sign in at `/signin`. With `EMAIL_SERVER` unset, the magic link is printed in the dev-server console and
written to `.dev-mail/last-link.txt` (and `.dev-mail/<email>.txt`). Open it to sign in. New users land on
`/onboarding` (name, school, graduation year, time zone) before the app shell.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm run lint` | ESLint (Next.js core-web-vitals + TypeScript rules) |
| `npm run typecheck` | `prisma generate` then `tsc --noEmit` |
| `npm test` | Vitest (unit + DB tests on a throwaway SQLite file in `.test-db/`) |
| `npm run test:coverage` | Vitest with V8 coverage |
| `npm run db:push` | Push the schema to `DATABASE_URL` and regenerate the client |
| `npm run db:seed` | Idempotent sample data (`prisma/seed.ts` via tsx) |
| `npm run worker` | Scheduled scraper worker (milestone 2) |
| `npm run e2e` | Playwright against `next dev` on port 3100 with `.test-db/e2e.db` |

Python scraper tests: `python -m unittest discover -s scraper/tests`.

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

Inroad applies only inside a campaign the user approved, and a rule change needs a new approval. It
drafts outreach but never sends it. It never offers rewards for referrals, and never scrapes social media,
LinkedIn, Meta Careers or Google Careers. Every application it prepares is logged with the reason.
