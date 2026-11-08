"""Exception hierarchy for the scraper. Every expected failure is a ScrapeError."""

from __future__ import annotations


class ScrapeError(Exception):
    """Base class for all scraper failures that a run should report, not crash on."""


class ConfigError(ScrapeError):
    """The companies config file is missing or invalid."""


class DisallowedHostError(ScrapeError):
    """A request targeted a host outside the public ATS allow-list."""


class ParseError(ScrapeError):
    """An ATS response did not have the documented shape."""


class HttpError(ScrapeError):
    """A request failed (after retries) or returned an unusable body."""

    def __init__(self, message: str, *, status: int | None = None, url: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.url = url
