import unittest

from scraper.ats import common
from scraper.config import parse_companies
from scraper.errors import ParseError

(STRIPE,) = parse_companies({"companies": [{"name": "Stripe", "ats": "greenhouse", "board": "stripe"}]})


def job_kwargs(**overrides):
    base = {
        "posting_id": "1",
        "title": "Software Engineer Intern",
        "url": "https://boards.greenhouse.io/stripe/jobs/1",
        "source": "Greenhouse feed",
        "description_text": "Build payments APIs.",
        "location": "New York",
        "posted_at": None,
        "compensation": None,
        "department": None,
        "employment_type": None,
        "include_all": True,
    }
    base.update(overrides)
    return base


class BuildJobLimitsTest(unittest.TestCase):
    """The worker's contract (worker/runSchema.ts) caps these fields; one long value must not reject the run."""

    def test_short_text_fields_are_cut_to_the_worker_limit(self):
        long_text = "word " * 200  # 1000 characters
        job = common.build_job(
            STRIPE,
            **job_kwargs(
                title="Intern " + long_text,
                location=long_text,
                compensation=long_text,
                department=long_text,
            ),
        )
        for value in (job.title, job.location, job.compensation, job.department):
            self.assertLessEqual(len(value), common.MAX_SHORT_TEXT)
            self.assertTrue(value.endswith("…"))

    def test_short_values_are_kept_as_is(self):
        job = common.build_job(STRIPE, **job_kwargs(compensation="$45/hr", department="Engineering"))
        self.assertEqual(job.compensation, "$45/hr")
        self.assertEqual(job.department, "Engineering")

    def test_over_long_url_is_a_parse_error(self):
        url = "https://boards.greenhouse.io/stripe/jobs/" + "a" * common.MAX_URL
        with self.assertRaises(ParseError):
            common.build_job(STRIPE, **job_kwargs(url=url))

    def test_over_long_posting_id_is_a_parse_error(self):
        with self.assertRaises(ParseError):
            common.build_job(STRIPE, **job_kwargs(posting_id="9" * common.MAX_SHORT_TEXT))


class ParseEachTest(unittest.TestCase):
    def parse_one(self, item):
        if item == "bad":
            raise ParseError("posting has no title")
        if item == "drop":
            return None
        return common.build_job(STRIPE, **job_kwargs(posting_id=item))

    def test_skips_some_malformed_postings(self):
        jobs = common.parse_each(["1", "bad", "2"], STRIPE, self.parse_one)
        self.assertEqual([job.id for job in jobs], ["greenhouse:stripe:1", "greenhouse:stripe:2"])

    def test_every_posting_malformed_fails_the_company(self):
        with self.assertRaisesRegex(ParseError, "all 3 postings"):
            common.parse_each(["bad", "bad", "bad"], STRIPE, self.parse_one)

    def test_empty_board_is_not_an_error(self):
        self.assertEqual(common.parse_each([], STRIPE, self.parse_one), [])

    def test_postings_dropped_by_the_classifier_are_not_failures(self):
        self.assertEqual(common.parse_each(["drop", "drop"], STRIPE, self.parse_one), [])

    def test_some_failed_and_none_parsed_fails_the_company(self):
        # Non-early-career postings are dropped and every early-career one is malformed (e.g. no id):
        # reporting ok with no jobs would close the company's open jobs.
        with self.assertRaisesRegex(ParseError, "1 of 3 postings failed"):
            common.parse_each(["drop", "bad", "drop"], STRIPE, self.parse_one)

    def test_mixed_dropped_and_missing_id_fails_the_company(self):
        def parse_one(item):
            return common.build_job(STRIPE, **job_kwargs(**item))

        items = [
            {"title": "Director, Payments", "include_all": False},
            {"title": "Software Engineer Intern", "posting_id": "9" * common.MAX_SHORT_TEXT},
        ]
        with self.assertRaises(ParseError):
            common.parse_each(items, STRIPE, parse_one)

    def test_dropped_postings_plus_one_missing_id_fails_the_company(self):
        def parse_one(item):
            return common.build_job(STRIPE, **job_kwargs(**item))

        items = [
            {"title": "Director, Payments", "include_all": False},
            {"title": "Software Engineer Intern", "posting_id": None, "include_all": False},
        ]
        with self.assertRaisesRegex(ParseError, "failed to parse and none parsed"):
            common.parse_each(items, STRIPE, parse_one)


if __name__ == "__main__":
    unittest.main()
