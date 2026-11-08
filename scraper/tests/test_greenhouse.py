import copy
import unittest

from scraper.ats import greenhouse
from scraper.config import parse_companies
from scraper.errors import ParseError
from scraper.tests.helpers import FakeClient, load_fixture

(STRIPE,) = parse_companies({"companies": [{"name": "Stripe", "ats": "greenhouse", "board": "stripe"}]})


class GreenhouseParseTest(unittest.TestCase):
    def setUp(self):
        self.payload = load_fixture("greenhouse_jobs.json")

    def test_listing_url(self):
        self.assertEqual(
            greenhouse.build_url(STRIPE),
            "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
        )

    def test_keeps_only_early_career_roles(self):
        jobs = greenhouse.parse(self.payload, STRIPE)
        self.assertEqual([(j.title, j.type) for j in jobs], [
            ("Data Analyst, Intern", "intern"),
            ("Software Engineer, New Grad", "newgrad"),
        ])

    def test_include_all_keeps_unclassified(self):
        jobs = greenhouse.parse(self.payload, STRIPE, include_all=True)
        self.assertEqual(len(jobs), 3)
        self.assertIsNone(jobs[2].type)

    def test_fields(self):
        job = greenhouse.parse(self.payload, STRIPE)[0]
        self.assertEqual(job.id, "greenhouse:stripe:8194287")
        self.assertEqual(job.company, "Stripe")
        self.assertEqual(job.ats, "greenhouse")
        self.assertEqual(job.location, "Toronto")
        self.assertEqual(job.posted_at, "2026-10-01T15:05:36Z")
        self.assertEqual(job.url, "https://stripe.com/jobs/search?gh_jid=8194287")
        self.assertEqual(job.source, "Greenhouse feed")
        self.assertEqual(job.department, "5112 General University")
        self.assertIsNone(job.compensation)

    def test_double_escaped_html_is_stripped(self):
        for job in greenhouse.parse(self.payload, STRIPE):
            self.assertTrue(job.description_text.startswith("Who we are"))
            for marker in ("<", "&lt;", "&amp;", "&quot;"):
                self.assertNotIn(marker, job.description_text)

    def test_ids_are_stable_across_runs(self):
        first = [j.id for j in greenhouse.parse(self.payload, STRIPE)]
        reordered = copy.deepcopy(self.payload)
        reordered["jobs"].reverse()
        second = sorted(j.id for j in greenhouse.parse(reordered, STRIPE))
        self.assertEqual(sorted(first), second)

    def test_falls_back_to_updated_at(self):
        payload = copy.deepcopy(self.payload)
        payload["jobs"][0]["first_published"] = None
        job = greenhouse.parse(payload, STRIPE)[0]
        self.assertEqual(job.posted_at, "2026-10-29T14:42:09Z")

    def test_skips_malformed_postings_but_keeps_the_rest(self):
        payload = copy.deepcopy(self.payload)
        payload["jobs"].insert(0, {"title": "Intern without id"})
        payload["jobs"].insert(0, "garbage")
        self.assertEqual(len(greenhouse.parse(payload, STRIPE)), 2)

    def test_rejects_unexpected_payload(self):
        for payload in ({}, {"jobs": "x"}, [], None):
            with self.subTest(payload=payload):
                with self.assertRaises(ParseError):
                    greenhouse.parse(payload, STRIPE)


class GreenhouseFetchTest(unittest.TestCase):
    def test_fetch_calls_public_board_api(self):
        client = FakeClient(get=lambda url: load_fixture("greenhouse_jobs.json"))
        jobs = greenhouse.fetch(STRIPE, client)
        self.assertEqual(client.get_calls, [greenhouse.build_url(STRIPE)])
        self.assertEqual(len(jobs), 2)


if __name__ == "__main__":
    unittest.main()
