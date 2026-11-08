import unittest

from scraper.allowlist import ensure_allowed_url, is_allowed_url
from scraper.errors import DisallowedHostError


class AllowListTest(unittest.TestCase):
    ALLOWED = [
        "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true",
        "https://api.lever.co/v0/postings/palantir?mode=json",
        "https://api.eu.lever.co/v0/postings/someco?mode=json",
        "https://api.ashbyhq.com/posting-api/job-board/ramp?includeCompensation=true",
        "https://capitalone.wd12.myworkdayjobs.com/wday/cxs/capitalone/Capital_One/jobs",
        "https://BOARDS-API.GREENHOUSE.IO/v1/boards/stripe/jobs",
    ]
    REJECTED = [
        "https://www.linkedin.com/jobs/search?keywords=intern",
        "https://linkedin.com/jobs",
        "https://www.instagram.com/stripe",
        "https://www.metacareers.com/jobs",
        "https://careers.google.com/jobs/results/",
        "https://www.google.com/about/careers/applications/jobs/results",
        "https://www.facebook.com/careers",
        "https://twitter.com/stripe",
        "http://boards-api.greenhouse.io/v1/boards/stripe/jobs",
        "https://boards-api.greenhouse.io.evil.com/v1/boards/stripe/jobs",
        "https://evil.com/boards-api.greenhouse.io",
        "https://boards-api.greenhouse.io@evil.com/v1/boards",
        "https://capitalone.wd12.myworkdayjobs.com.evil.com/x",
        "https://myworkdayjobs.com/x",
        "https://evil.myworkdayjobs.com/x",
        "https://boards.greenhouse.io/stripe",
        "https://jobs.lever.co/palantir",
        "https://boards-api.greenhouse.io:8443/v1/boards/stripe/jobs",
        "ftp://api.lever.co/x",
        "file:///etc/passwd",
        "",
        "not a url",
    ]

    def test_allowed_ats_hosts(self):
        for url in self.ALLOWED:
            with self.subTest(url=url):
                self.assertTrue(is_allowed_url(url))
                ensure_allowed_url(url)

    def test_rejected_hosts(self):
        for url in self.REJECTED:
            with self.subTest(url=url):
                self.assertFalse(is_allowed_url(url))
                with self.assertRaises(DisallowedHostError):
                    ensure_allowed_url(url)

    def test_non_string_is_rejected(self):
        self.assertFalse(is_allowed_url(None))  # type: ignore[arg-type]


if __name__ == "__main__":
    unittest.main()
