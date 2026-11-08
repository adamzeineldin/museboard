import copy
import unittest

from scraper.ats import workday
from scraper.config import parse_companies
from scraper.errors import HttpError, ParseError, ScrapeError
from scraper.tests.helpers import FakeClient, load_fixture

BASE = "https://capitalone.wd12.myworkdayjobs.com/wday/cxs/capitalone/Capital_One"
INTERN_PATH = "/job/Toronto-ON/Intern--Strategy-Analyst---Summer-2027_R243855-1"
GRAD_PATH = "/job/Toronto-ON/Associate--Strategy-Analyst---New-Grad-2027_R242577-1"


def capital_one(**extra):
    entry = {"name": "Capital One", "ats": "workday", "tenant": "capitalone", "wd": "wd12", "site": "Capital_One"}
    entry.update(extra)
    (company,) = parse_companies({"companies": [entry]})
    return company


def pages_by_offset(pages):
    def post(url, body):
        assert url == BASE + "/jobs", url
        return pages[body["offset"] // workday.PAGE_SIZE]
    return post


def details(url):
    mapping = {
        BASE + INTERN_PATH: "workday_detail_intern.json",
        BASE + GRAD_PATH: "workday_detail_newgrad.json",
    }
    if url not in mapping:
        raise AssertionError(f"unexpected detail fetch {url}")
    return load_fixture(mapping[url])


class WorkdayHelpersTest(unittest.TestCase):
    def test_urls(self):
        company = capital_one()
        self.assertEqual(workday.build_url(company), BASE + "/jobs")
        self.assertEqual(workday.detail_url(company, INTERN_PATH), BASE + INTERN_PATH)

    def test_detail_url_rejects_path_tricks(self):
        company = capital_one()
        for path in ("https://evil.com/job/x", "/job/../../admin", "//evil.com/job", "job/x", "/job/x?y=1", ""):
            with self.subTest(path=path):
                with self.assertRaises(ParseError):
                    workday.detail_url(company, path)

    def test_posting_id_from_path(self):
        self.assertEqual(workday.posting_id_from_path(INTERN_PATH), "R243855-1")
        self.assertEqual(workday.posting_id_from_path("/job/Remote/Some-Role"), "Some-Role")


class WorkdayFetchTest(unittest.TestCase):
    def setUp(self):
        self.pages = [load_fixture("workday_page1.json"), load_fixture("workday_page2.json")]

    def test_paginates_until_total_and_fetches_candidate_details_only(self):
        client = FakeClient(get=details, post=pages_by_offset(self.pages))
        jobs = workday.fetch(capital_one(), client)
        self.assertEqual([body["offset"] for _, body in client.post_calls], [0, 20])
        self.assertTrue(all(body["limit"] == 20 for _, body in client.post_calls))
        self.assertEqual(sorted(client.get_calls), sorted([BASE + INTERN_PATH, BASE + GRAD_PATH]))
        self.assertEqual([(j.title, j.type) for j in jobs], [
            ("Intern, Strategy Analyst - Summer 2027", "intern"),
            ("Associate, Strategy Analyst - New Grad 2027", "newgrad"),
        ])

    def test_job_fields(self):
        client = FakeClient(get=details, post=pages_by_offset(self.pages))
        intern = workday.fetch(capital_one(), client)[0]
        self.assertEqual(intern.id, "workday:capital-one:R243855-1")
        self.assertEqual(intern.company, "Capital One")
        self.assertEqual(intern.location, "Toronto, ON")
        self.assertEqual(intern.source, "Workday feed")
        self.assertEqual(intern.url, "https://capitalone.wd12.myworkdayjobs.com/Capital_One" + INTERN_PATH)
        self.assertRegex(intern.posted_at or "", r"^2026-11-0\dT00:00:00Z$")
        self.assertTrue(intern.description_text)
        self.assertNotIn("<p", intern.description_text)

    def test_ids_are_stable(self):
        first = [j.id for j in workday.fetch(capital_one(), FakeClient(get=details, post=pages_by_offset(self.pages)))]
        second = [j.id for j in workday.fetch(capital_one(), FakeClient(get=details, post=pages_by_offset(self.pages)))]
        self.assertEqual(first, second)

    def test_include_all_keeps_listing_only_postings(self):
        client = FakeClient(get=details, post=pages_by_offset(self.pages))
        jobs = workday.fetch(capital_one(), client, include_all=True)
        self.assertEqual(len(jobs), 23)
        self.assertEqual(len(client.get_calls), 2)
        listing = next(p for p in self.pages[0]["jobPostings"] if p["title"] == "Director, Risk Management")
        other = next(j for j in jobs if j.title == "Director, Risk Management")
        self.assertIsNone(other.type)
        self.assertEqual(other.location, listing["locationsText"])
        self.assertEqual(other.description_text, "")
        self.assertIsNone(other.posted_at)

    def test_listing_that_ends_before_total_is_an_error(self):
        first = copy.deepcopy(self.pages[0])
        first["total"] = 500
        pages = [first, {"total": 0, "jobPostings": []}]
        client = FakeClient(get=details, post=pages_by_offset(pages))
        with self.assertRaisesRegex(ScrapeError, "ended at 20 of 500"):
            workday.fetch(capital_one(), client)
        self.assertEqual(len(client.post_calls), 2)

    def test_short_non_empty_last_page_ends_the_listing_even_below_the_reported_total(self):
        # Workday totals are approximate: a partial page is the real end of the listing, not a truncation.
        first = copy.deepcopy(self.pages[0])
        first["total"] = 500
        client = FakeClient(get=details, post=pages_by_offset([first, self.pages[1]]))
        jobs = workday.fetch(capital_one(), client)
        self.assertEqual(len(client.post_calls), 2)
        self.assertEqual(len(jobs), 2)

    def test_first_page_without_total_is_an_error(self):
        for total in (None, 0, "500", True):
            with self.subTest(total=total):
                first = copy.deepcopy(self.pages[0])
                if total is None:
                    first.pop("total", None)
                else:
                    first["total"] = total
                client = FakeClient(get=details, post=pages_by_offset([first, self.pages[1]]))
                with self.assertRaises(ParseError):
                    workday.fetch(capital_one(), client)

    def test_empty_first_page_with_a_positive_total_is_an_error(self):
        client = FakeClient(post=lambda url, body: {"total": 40, "jobPostings": []})
        with self.assertRaisesRegex(ScrapeError, "ended at 0 of 40"):
            workday.fetch(capital_one(), client)

    def test_malformed_detail_is_skipped_when_another_posting_parses(self):
        def one_broken(url):
            if url == BASE + GRAD_PATH:
                return {"nothing": True}
            return details(url)

        client = FakeClient(get=one_broken, post=pages_by_offset(self.pages))
        jobs = workday.fetch(capital_one(), client)
        self.assertEqual([j.title for j in jobs], ["Intern, Strategy Analyst - Summer 2027"])

    def test_candidate_with_a_bad_path_is_skipped_when_another_posting_parses(self):
        second = copy.deepcopy(self.pages[1])
        grad = next(p for p in second["jobPostings"] if p["externalPath"] == GRAD_PATH)
        grad["externalPath"] = "/job/../../admin"
        client = FakeClient(get=details, post=pages_by_offset([self.pages[0], second]))
        jobs = workday.fetch(capital_one(), client)
        self.assertEqual([j.title for j in jobs], ["Intern, Strategy Analyst - Summer 2027"])
        self.assertEqual(client.get_calls, [BASE + INTERN_PATH])

    def test_bad_path_on_a_dropped_posting_is_not_a_failure(self):
        first = copy.deepcopy(self.pages[0])
        director = next(p for p in first["jobPostings"] if p["title"] == "Director, Risk Management")
        director["externalPath"] = "not-a-path"
        client = FakeClient(get=details, post=pages_by_offset([first, self.pages[1]]))
        self.assertEqual(len(workday.fetch(capital_one(), client)), 2)

    def test_empty_board_is_ok(self):
        client = FakeClient(post=lambda url, body: {"total": 0, "jobPostings": []})
        self.assertEqual(workday.fetch(capital_one(), client), [])

    def test_truncated_listing_is_an_error(self):
        client = FakeClient(get=details, post=pages_by_offset(self.pages))
        with self.assertRaises(ScrapeError):
            workday.fetch(capital_one(max_pages=1), client)

    def test_too_many_details_is_an_error(self):
        client = FakeClient(get=details, post=pages_by_offset(self.pages))
        with self.assertRaises(ScrapeError):
            workday.fetch(capital_one(max_details=1), client)

    def test_detail_failure_fails_the_company(self):
        def broken(url):
            raise HttpError("boom", status=500, url=url)

        client = FakeClient(get=broken, post=pages_by_offset(self.pages))
        with self.assertRaises(HttpError):
            workday.fetch(capital_one(), client)

    def test_rejects_unexpected_listing(self):
        client = FakeClient(post=lambda url, body: {"jobPostings": "nope"})
        with self.assertRaises(ParseError):
            workday.fetch(capital_one(), client)

    def test_rejects_unexpected_detail(self):
        client = FakeClient(get=lambda url: {"nothing": True}, post=pages_by_offset(self.pages))
        with self.assertRaises(ParseError):
            workday.fetch(capital_one(), client)


if __name__ == "__main__":
    unittest.main()
