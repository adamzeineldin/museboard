import io
import json
import unittest
import urllib.error
import urllib.request
from email.message import Message

from scraper.errors import DisallowedHostError, HttpError
from scraper.http import USER_AGENT, GuardedRedirectHandler, HttpClient, RateLimiter

GH_URL = "https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=true"
WD_URL = "https://capitalone.wd12.myworkdayjobs.com/wday/cxs/capitalone/Capital_One/jobs"


class FakeResponse(io.BytesIO):
    def __init__(self, body: bytes, status: int = 200):
        super().__init__(body)
        self.status = status

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()
        return False


def http_error(url: str, code: int, headers: dict | None = None) -> urllib.error.HTTPError:
    msg = Message()
    for key, value in (headers or {}).items():
        msg[key] = value
    return urllib.error.HTTPError(url, code, "error", msg, io.BytesIO(b""))


class FakeOpener:
    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.requests: list[urllib.request.Request] = []
        self.timeouts: list[float] = []

    def open(self, request, timeout=None):
        self.requests.append(request)
        self.timeouts.append(timeout)
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, BaseException):
            raise outcome
        return FakeResponse(outcome)


def make_client(outcomes, **kwargs):
    opener = FakeOpener(outcomes)
    sleeps: list[float] = []
    client = HttpClient(opener=opener, sleep=sleeps.append, min_interval=0, **kwargs)
    return client, opener, sleeps


class HttpClientTest(unittest.TestCase):
    def test_get_json_sends_polite_headers(self):
        client, opener, _ = make_client([b'{"jobs": []}'], timeout=7)
        self.assertEqual(client.get_json(GH_URL), {"jobs": []})
        request = opener.requests[0]
        self.assertEqual(request.get_method(), "GET")
        self.assertEqual(request.get_header("User-agent"), USER_AGENT)
        self.assertEqual(request.get_header("Accept"), "application/json")
        self.assertEqual(opener.timeouts, [7])

    def test_user_agent_has_no_personal_data(self):
        self.assertEqual(USER_AGENT, "InroadJobScraper/1.0")

    def test_post_json_encodes_body(self):
        client, opener, _ = make_client([b'{"total": 0, "jobPostings": []}'])
        client.post_json(WD_URL, {"limit": 20, "offset": 0})
        request = opener.requests[0]
        self.assertEqual(request.get_method(), "POST")
        self.assertEqual(request.get_header("Content-type"), "application/json")
        self.assertEqual(json.loads(request.data), {"limit": 20, "offset": 0})

    def test_disallowed_host_never_hits_network(self):
        client, opener, _ = make_client([])
        for url in ("https://www.linkedin.com/jobs", "https://www.metacareers.com/jobs"):
            with self.assertRaises(DisallowedHostError):
                client.get_json(url)
        with self.assertRaises(DisallowedHostError):
            client.post_json("https://careers.google.com/api", {})
        self.assertEqual(opener.requests, [])

    def test_retries_server_errors_with_backoff(self):
        client, opener, sleeps = make_client(
            [http_error(GH_URL, 503), urllib.error.URLError("reset"), b"[]"],
            backoff_base=0.5,
        )
        self.assertEqual(client.get_json(GH_URL), [])
        self.assertEqual(len(opener.requests), 3)
        self.assertEqual(sleeps, [0.5, 1.0])

    def test_retries_timeouts(self):
        client, _, sleeps = make_client([TimeoutError("slow"), b"{}"])
        self.assertEqual(client.get_json(GH_URL), {})
        self.assertEqual(len(sleeps), 1)

    def test_honours_retry_after_on_429(self):
        client, _, sleeps = make_client([http_error(GH_URL, 429, {"Retry-After": "3"}), b"{}"])
        client.get_json(GH_URL)
        self.assertEqual(sleeps, [3.0])

    def test_retry_after_is_capped(self):
        client, _, sleeps = make_client([http_error(GH_URL, 429, {"Retry-After": "9999"}), b"{}"])
        client.get_json(GH_URL)
        self.assertLessEqual(sleeps[0], 60.0)

    def test_does_not_retry_client_errors(self):
        client, opener, sleeps = make_client([http_error(GH_URL, 404)])
        with self.assertRaises(HttpError) as ctx:
            client.get_json(GH_URL)
        self.assertEqual(ctx.exception.status, 404)
        self.assertEqual(len(opener.requests), 1)
        self.assertEqual(sleeps, [])

    def test_gives_up_after_max_attempts(self):
        client, opener, _ = make_client([http_error(GH_URL, 500)] * 3, max_attempts=3)
        with self.assertRaises(HttpError) as ctx:
            client.get_json(GH_URL)
        self.assertEqual(ctx.exception.status, 500)
        self.assertEqual(len(opener.requests), 3)

    def test_invalid_json_raises_http_error(self):
        client, _, _ = make_client([b"<html>not json</html>"])
        with self.assertRaises(HttpError):
            client.get_json(GH_URL)

    def test_oversized_body_is_rejected(self):
        client, _, _ = make_client([b"[" + b"1," * 100 + b"1]"], max_bytes=50)
        with self.assertRaises(HttpError):
            client.get_json(GH_URL)

    def test_rejects_bad_settings(self):
        with self.assertRaises(ValueError):
            HttpClient(max_attempts=0)
        with self.assertRaises(ValueError):
            HttpClient(timeout=0)


class RedirectGuardTest(unittest.TestCase):
    def test_redirect_to_disallowed_host_is_blocked(self):
        handler = GuardedRedirectHandler()
        request = urllib.request.Request(GH_URL)
        with self.assertRaises(DisallowedHostError):
            handler.redirect_request(request, None, 302, "Found", Message(), "https://www.linkedin.com/jobs")

    def test_redirect_within_allow_list_is_followed(self):
        handler = GuardedRedirectHandler()
        request = urllib.request.Request(GH_URL)
        new = handler.redirect_request(
            request, None, 301, "Moved", Message(), "https://boards-api.greenhouse.io/v1/boards/stripe/jobs"
        )
        self.assertIsNotNone(new)


class RateLimiterTest(unittest.TestCase):
    def test_spaces_requests_to_the_same_host(self):
        times = iter([0.0, 0.1, 10.0])
        sleeps: list[float] = []
        limiter = RateLimiter(min_interval=0.25, clock=lambda: next(times), sleep=sleeps.append)
        limiter.wait("api.lever.co")
        limiter.wait("api.lever.co")
        self.assertEqual(len(sleeps), 1)
        self.assertAlmostEqual(sleeps[0], 0.15)

    def test_different_hosts_do_not_wait(self):
        sleeps: list[float] = []
        limiter = RateLimiter(min_interval=1.0, clock=lambda: 5.0, sleep=sleeps.append)
        limiter.wait("api.lever.co")
        limiter.wait("api.ashbyhq.com")
        self.assertEqual(sleeps, [])


if __name__ == "__main__":
    unittest.main()
