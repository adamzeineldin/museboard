# scraper

Python 3.11+ (standard library only). Reads **public ATS job-board APIs only** and prints
intern / new-grad postings as JSON for the TypeScript worker.

```
python3 -m scraper --companies scraper/companies.json [--out FILE|-] [--company NAME] [--include-all] [-v]
python3 -m unittest            # from the repo root
```

| ATS | Request |
|---|---|
| Greenhouse | `GET https://boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true` |
| Lever | `GET https://api.lever.co/v0/postings/{site}?mode=json` (`"region": "eu"` uses `api.eu.lever.co`) |
| Ashby | `GET https://api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true` |
| Workday | `POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs` (limit 20, offset paging), then `GET .../{site}{externalPath}` for candidate postings |

Every request URL and every redirect target must pass `scraper/allowlist.py`
(https, exact ATS API hosts, `<tenant>.wdN.myworkdayjobs.com`). LinkedIn, Instagram, Meta Careers,
Google Careers and every other host are refused before any connection is made.

## Output contract

```jsonc
{
  "run_at": "2026-11-07T22:14:07Z",          // UTC, seconds precision
  "companies": [
    {
      "company": "Stripe",                    // == companies.json name (== Company.name in the DB)
      "ats": "greenhouse",                    // greenhouse | lever | ashby | workday
      "ok": true,                             // false => error set, jobs [] => do NOT close this company's jobs
      "error": null,                          // string (<= 500 chars) when ok is false
      "jobs": [
        {
          "id": "greenhouse:stripe:8194287",  // "<ats>:<companySlug>:<postingId>", stable across runs
          "company": "Stripe",
          "ats": "greenhouse",
          "title": "Data Analyst, Intern",
          "location": "Toronto",              // string | null
          "type": "intern",                   // "intern" | "newgrad" (null only with --include-all)
          "posted_at": "2026-10-01T15:05:36Z",// UTC ISO | null
          "url": "https://stripe.com/jobs/search?gh_jid=8194287",
          "source": "Greenhouse feed",        // "<ATS> feed"
          "description_text": "Who we are ...", // plain text, <= 8000 chars
          "compensation": null,               // string | null (Ashby, Lever when published)
          "department": "5112 General University" // string | null
        }
      ]
    }
  ]
}
```

`id`, `title`, `location`, `compensation` and `department` are at most 500 characters and `url` at most 2048
(the worker's limits in `worker/runSchema.ts`): long text is cut with an ellipsis, and a posting with a longer id
or URL is skipped. A malformed posting (including a Workday posting whose detail page has an unexpected shape) is
logged and skipped. A company is reported `ok: false` when at least one posting fails to parse and none parses, or
a Workday listing page comes back empty before the reported total, so the worker never closes jobs on an incomplete
listing. Workday totals are approximate, so a short page that still has postings ends the listing normally.

This is deliberately fail safe: on a board with no early-career matches, a single unparseable posting makes that
company report a failure on every run (its jobs are not closed) until the posting or the adapter is fixed.

Exit codes: `0` at least one company ok, `1` every company failed (JSON still written), `2` usage/config error
(nothing written).
