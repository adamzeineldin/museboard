"""Polite JSON HTTP client for public ATS APIs.

- Every URL (and every redirect target) must pass the ATS host allow-list.
- Timeouts, bounded retries with exponential backoff (429 / 5xx / network errors),
  ``Retry-After`` support, and a per-host minimum interval between requests.
- Identifies itself as ``InroadJobScraper/1.0``; sends no cookies, no personal data.
"""

from __future__ import annotations

import json
import logging
import socket
import threading
import time
import urllib.error
import urllib.request
from typing import Any, Callable
from urllib.parse import urlsplit

from .allowlist import ensure_allowed_url
from .errors import DisallowedHostError, HttpError

USER_AGENT = "InroadJobScraper/1.0"
DEFAULT_TIMEOUT = 20.0
DEFAULT_MAX_ATTEMPTS = 3
DEFAULT_BACKOFF_BASE = 0.5
MAX_BACKOFF = 8.0
MAX_RETRY_AFTER = 60.0
DEFAULT_MIN_INTERVAL = 0.25
DEFAULT_MAX_BYTES = 50 * 1024 * 1024
RETRYABLE_STATUSES = frozenset({429, 500, 502, 503, 504})

log = logging.getLogger(__name__)


class GuardedRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Follow redirects only to hosts that are on the ATS allow-list."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):  # noqa: ANN001 - stdlib signature
        ensure_allowed_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


class RateLimiter:
    """Thread-safe minimum spacing between requests to the same host."""

    def __init__(
        self,
        min_interval: float = DEFAULT_MIN_INTERVAL,
        clock: Callable[[], float] = time.monotonic,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        self._min_interval = max(0.0, min_interval)
        self._clock = clock
        self._sleep = sleep
        self._next_slot: dict[str, float] = {}
        self._lock = threading.Lock()

    def wait(self, host: str) -> None:
        if self._min_interval <= 0:
            return
        with self._lock:
            now = self._clock()
            slot = max(now, self._next_slot.get(host, now))
            self._next_slot = {**self._next_slot, host: slot + self._min_interval}
        delay = slot - now
        if delay > 0:
            self._sleep(delay)


def _retry_after_seconds(error: urllib.error.HTTPError) -> float | None:
    value = error.headers.get("Retry-After") if error.headers else None
    try:
        return min(MAX_RETRY_AFTER, max(0.0, float(value))) if value is not None else None
    except ValueError:
        return None


class HttpClient:
    def __init__(
        self,
        *,
        timeout: float = DEFAULT_TIMEOUT,
        max_attempts: int = DEFAULT_MAX_ATTEMPTS,
        backoff_base: float = DEFAULT_BACKOFF_BASE,
        min_interval: float = DEFAULT_MIN_INTERVAL,
        max_bytes: int = DEFAULT_MAX_BYTES,
        opener: Any = None,
        sleep: Callable[[float], None] = time.sleep,
    ) -> None:
        if timeout <= 0:
            raise ValueError("timeout must be positive")
        if max_attempts < 1:
            raise ValueError("max_attempts must be >= 1")
        self._timeout = timeout
        self._max_attempts = max_attempts
        self._backoff_base = backoff_base
        self._max_bytes = max_bytes
        self._opener = opener or urllib.request.build_opener(GuardedRedirectHandler())
        self._sleep = sleep
        self._limiter = RateLimiter(min_interval, sleep=sleep)

    def get_json(self, url: str) -> Any:
        return self._request("GET", url, None)

    def post_json(self, url: str, body: Any) -> Any:
        return self._request("POST", url, json.dumps(body).encode("utf-8"))

    def _build_request(self, method: str, url: str, data: bytes | None) -> urllib.request.Request:
        headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
        if data is not None:
            headers["Content-Type"] = "application/json"
        return urllib.request.Request(url, data=data, headers=headers, method=method)

    def _backoff(self, attempt: int) -> float:
        return min(MAX_BACKOFF, self._backoff_base * (2 ** (attempt - 1)))

    def _request(self, method: str, url: str, data: bytes | None) -> Any:
        ensure_allowed_url(url)
        host = urlsplit(url).hostname or ""
        last_error: HttpError | None = None
        for attempt in range(1, self._max_attempts + 1):
            self._limiter.wait(host)
            try:
                return self._send_once(method, url, data)
            except urllib.error.HTTPError as exc:
                last_error = HttpError(f"HTTP {exc.code} from {host}", status=exc.code, url=url)
                if exc.code not in RETRYABLE_STATUSES:
                    raise last_error from exc
                delay = _retry_after_seconds(exc)
            except DisallowedHostError:
                raise
            except (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError) as exc:
                reason = getattr(exc, "reason", exc)
                last_error = HttpError(f"network error contacting {host}: {reason}", url=url)
                delay = None
            if attempt < self._max_attempts:
                wait = delay if delay is not None else self._backoff(attempt)
                log.warning("retrying %s %s in %.1fs (attempt %d): %s", method, url, wait, attempt, last_error)
                self._sleep(wait)
        assert last_error is not None
        raise last_error

    def _send_once(self, method: str, url: str, data: bytes | None) -> Any:
        request = self._build_request(method, url, data)
        with self._opener.open(request, timeout=self._timeout) as response:
            body = response.read(self._max_bytes + 1)
        if len(body) > self._max_bytes:
            raise HttpError(f"response from {url} exceeds {self._max_bytes} bytes", url=url)
        try:
            return json.loads(body.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise HttpError(f"invalid JSON from {url}: {exc}", url=url) from exc
