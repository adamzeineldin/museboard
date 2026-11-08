import copy
import unittest

from scraper.ats import ashby
from scraper.config import parse_companies
from scraper.errors import ParseError
from scraper.tests.helpers import FakeClient, load_fixture

(RAMP,) = parse_companies({"companies": [{"name": "Ramp", "ats": "ashby", "board": "ramp"}]})


class AshbyParseTest(unittest.TestCase):
    def setUp(self):
        self.payload = load_fixture("ashby_board.json")

    def test_listing_url(self):
        self.assertEqual(
            ashby.build_url(RAMP),
            "https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true",
        )

    def test_classification_ignores_international(self):
        jobs = ashby.parse(self.payload, RAMP)
        self.assertEqual([(j.title, j.type) for j in jobs], [
            ("Software Engineering Intern, Backend", "intern"),
            ("University Grad | Customer Experience Associate", "newgrad"),
        ])

    def test_fields(self):
        intern, grad = ashby.parse(self.payload, RAMP)
        self.assertEqual(intern.id, "ashby:ramp:" + self.payload["jobs"][0]["id"])
        self.assertEqual(intern.posted_at, "2026-04-09T01:01:29Z")
        self.assertEqual(intern.location, "New York, NY (HQ)")
        self.assertEqual(intern.department, "Engineering")
        self.assertEqual(intern.url, self.payload["jobs"][0]["jobUrl"])
        self.assertEqual(intern.source, "Ashby feed")
        self.assertEqual(grad.compensation, "$60K - $70K")
        self.assertNotIn("<", grad.description_text)

    def test_title_whitespace_is_trimmed(self):
        jobs = ashby.parse(self.payload, RAMP, include_all=True)
        self.assertIn("Security Engineer, Cloud", [j.title for j in jobs])

    def test_unlisted_postings_are_skipped(self):
        payload = copy.deepcopy(self.payload)
        payload["jobs"][0]["isListed"] = False
        self.assertEqual([j.type for j in ashby.parse(payload, RAMP)], ["newgrad"])

    def test_hidden_compensation_is_not_exposed(self):
        payload = copy.deepcopy(self.payload)
        payload["jobs"][1]["shouldDisplayCompensationOnJobPostings"] = False
        self.assertIsNone(ashby.parse(payload, RAMP)[1].compensation)

    def test_employment_type_intern(self):
        payload = copy.deepcopy(self.payload)
        payload["jobs"][3]["employmentType"] = "Intern"
        types = {j.title: j.type for j in ashby.parse(payload, RAMP)}
        self.assertEqual(types["Security Engineer, Cloud"], "intern")

    def test_rejects_unexpected_payload(self):
        for payload in ({}, {"jobs": None}, []):
            with self.subTest(payload=payload):
                with self.assertRaises(ParseError):
                    ashby.parse(payload, RAMP)


class AshbyFetchTest(unittest.TestCase):
    def test_fetch(self):
        client = FakeClient(get=lambda url: load_fixture("ashby_board.json"))
        self.assertEqual(len(ashby.fetch(RAMP, client)), 2)
        self.assertEqual(client.get_calls, [ashby.build_url(RAMP)])


if __name__ == "__main__":
    unittest.main()
