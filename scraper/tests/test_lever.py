import copy
import unittest

from scraper.ats import lever
from scraper.config import parse_companies
from scraper.errors import ParseError
from scraper.tests.helpers import FakeClient, load_fixture

(PALANTIR,) = parse_companies({"companies": [{"name": "Palantir", "ats": "lever", "site": "palantir"}]})


class LeverParseTest(unittest.TestCase):
    def setUp(self):
        self.payload = load_fixture("lever_postings.json")

    def test_listing_url(self):
        self.assertEqual(lever.build_url(PALANTIR), "https://api.lever.co/v0/postings/palantir?mode=json")

    def test_eu_region(self):
        (company,) = parse_companies({"companies": [
            {"name": "EuCo", "ats": "lever", "site": "euco", "region": "eu"},
        ]})
        self.assertEqual(lever.build_url(company), "https://api.eu.lever.co/v0/postings/euco?mode=json")

    def test_classification(self):
        jobs = lever.parse(self.payload, PALANTIR)
        self.assertEqual([(j.title, j.type) for j in jobs], [
            ("Deployment Strategist, Internship", "intern"),
            ("Deployment Strategist, New Grad - Commercial", "newgrad"),
        ])

    def test_fields(self):
        job = lever.parse(self.payload, PALANTIR)[0]
        self.assertEqual(job.id, "lever:palantir:774cf5c9-bf6a-4d77-bf60-d50ef1beb1a0")
        self.assertEqual(job.location, "Paris, France")
        self.assertEqual(job.department, "Echo")
        self.assertEqual(job.posted_at, "2026-05-11T16:31:48Z")
        self.assertEqual(job.url, "https://jobs.lever.co/palantir/774cf5c9-bf6a-4d77-bf60-d50ef1beb1a0")
        self.assertEqual(job.source, "Lever feed")
        self.assertNotIn("<", job.description_text)
        self.assertTrue(job.description_text)

    def test_commitment_intern_classifies_neutral_title(self):
        payload = copy.deepcopy(self.payload)
        payload[2]["categories"]["commitment"] = "Intern"
        jobs = lever.parse(payload, PALANTIR)
        self.assertEqual(jobs[-1].type, "intern")

    def test_salary_range_is_formatted(self):
        payload = copy.deepcopy(self.payload)
        payload[0]["salaryRange"] = {"currency": "USD", "interval": "per-year-salary", "min": 90000, "max": 120000}
        job = lever.parse(payload, PALANTIR)[0]
        self.assertEqual(job.compensation, "USD 90,000–120,000 per year")

    def test_salary_description_fallback(self):
        payload = copy.deepcopy(self.payload)
        payload[0]["salaryDescriptionPlain"] = "  $45/hr  "
        self.assertEqual(lever.parse(payload, PALANTIR)[0].compensation, "$45/hr")

    def test_long_salary_description_is_cut_to_the_worker_limit(self):
        payload = copy.deepcopy(self.payload)
        payload[0]["salaryDescriptionPlain"] = "Pay transparency. " * 40
        compensation = lever.parse(payload, PALANTIR)[0].compensation
        self.assertLessEqual(len(compensation), 500)
        self.assertTrue(compensation.startswith("Pay transparency."))

    def test_every_posting_without_a_title_fails_the_company(self):
        payload = copy.deepcopy(self.payload)
        for posting in payload:
            posting.pop("text", None)
        with self.assertRaises(ParseError):
            lever.parse(payload, PALANTIR)

    def test_rejects_unexpected_payload(self):
        for payload in ({"ok": False}, None, "x"):
            with self.subTest(payload=payload):
                with self.assertRaises(ParseError):
                    lever.parse(payload, PALANTIR)


class LeverFetchTest(unittest.TestCase):
    def test_fetch(self):
        client = FakeClient(get=lambda url: load_fixture("lever_postings.json"))
        jobs = lever.fetch(PALANTIR, client)
        self.assertEqual(client.get_calls, ["https://api.lever.co/v0/postings/palantir?mode=json"])
        self.assertEqual(len(jobs), 2)


if __name__ == "__main__":
    unittest.main()
