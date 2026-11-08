import re
import unittest
from datetime import datetime, timezone

from scraper.config import parse_companies
from scraper.errors import HttpError
from scraper.models import JOB_FIELDS, Job
from scraper.runner import run_scrape

COMPANIES = parse_companies({"companies": [
    {"name": "Stripe", "ats": "greenhouse", "board": "stripe"},
    {"name": "Ramp", "ats": "ashby", "board": "ramp"},
    {"name": "Palantir", "ats": "lever", "site": "palantir"},
]})


def job_for(company, posting_id="1"):
    return Job(
        id=f"{company.ats}:{company.slug}:{posting_id}",
        company=company.name,
        ats=company.ats,
        title="Software Engineering Intern",
        location="NYC",
        type="intern",
        posted_at=None,
        url="https://example.com/job",
        source="Test feed",
        description_text="",
        compensation=None,
        department=None,
    )


def ok_fetcher(company, client, include_all=False):
    return [job_for(company)]


class RunScrapeTest(unittest.TestCase):
    def test_one_failing_company_does_not_abort_the_run(self):
        def failing(company, client, include_all=False):
            raise HttpError("HTTP 503 from api.ashbyhq.com", status=503, url="https://api.ashbyhq.com/x")

        result = run_scrape(
            COMPANIES,
            client=object(),
            fetchers={"greenhouse": ok_fetcher, "ashby": failing, "lever": ok_fetcher},
            now=datetime(2026, 11, 7, 12, 0, tzinfo=timezone.utc),
        )
        self.assertEqual(result["run_at"], "2026-11-07T12:00:00Z")
        by_name = {c["company"]: c for c in result["companies"]}
        self.assertEqual([c["company"] for c in result["companies"]], ["Stripe", "Ramp", "Palantir"])
        self.assertTrue(by_name["Stripe"]["ok"])
        self.assertTrue(by_name["Palantir"]["ok"])
        self.assertFalse(by_name["Ramp"]["ok"])
        self.assertEqual(by_name["Ramp"]["jobs"], [])
        self.assertIn("503", by_name["Ramp"]["error"])
        self.assertIsNone(by_name["Stripe"]["error"])

    def test_unexpected_exceptions_are_isolated_too(self):
        def explode(company, client, include_all=False):
            raise KeyError("surprise")

        result = run_scrape(COMPANIES, client=object(),
                            fetchers={"greenhouse": explode, "ashby": ok_fetcher, "lever": ok_fetcher})
        flags = [c["ok"] for c in result["companies"]]
        self.assertEqual(flags, [False, True, True])
        self.assertTrue(result["companies"][0]["error"])

    def test_missing_fetcher_marks_company_failed(self):
        result = run_scrape(COMPANIES, client=object(), fetchers={"greenhouse": ok_fetcher})
        self.assertEqual([c["ok"] for c in result["companies"]], [True, False, False])

    def test_output_contract(self):
        result = run_scrape(COMPANIES, client=object(),
                            fetchers={"greenhouse": ok_fetcher, "ashby": ok_fetcher, "lever": ok_fetcher})
        self.assertEqual(set(result), {"run_at", "companies"})
        self.assertRegex(result["run_at"], r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")
        for company in result["companies"]:
            self.assertEqual(list(company), ["company", "ats", "ok", "error", "jobs"])
            for job in company["jobs"]:
                self.assertEqual(tuple(job), JOB_FIELDS)
                self.assertTrue(re.match(r"^(greenhouse|lever|ashby|workday):[a-z0-9-]+:.+$", job["id"]))

    def test_duplicate_ids_within_a_company_are_dropped(self):
        def dupes(company, client, include_all=False):
            return [job_for(company, "7"), job_for(company, "7"), job_for(company, "8")]

        result = run_scrape(COMPANIES[:1], client=object(), fetchers={"greenhouse": dupes})
        self.assertEqual([j["id"] for j in result["companies"][0]["jobs"]],
                         ["greenhouse:stripe:7", "greenhouse:stripe:8"])

    def test_include_all_is_forwarded(self):
        seen = []

        def spy(company, client, include_all=False):
            seen.append(include_all)
            return []

        run_scrape(COMPANIES[:1], client=object(), fetchers={"greenhouse": spy}, include_all=True)
        self.assertEqual(seen, [True])

    def test_error_messages_are_bounded(self):
        def long_error(company, client, include_all=False):
            raise RuntimeError("x" * 5000)

        result = run_scrape(COMPANIES[:1], client=object(), fetchers={"greenhouse": long_error})
        self.assertLessEqual(len(result["companies"][0]["error"]), 500)


if __name__ == "__main__":
    unittest.main()
