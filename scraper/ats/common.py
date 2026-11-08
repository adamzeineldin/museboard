"""Helpers shared by the ATS adapters."""

from __future__ import annotations

import logging
from typing import Any, Callable, Iterable, TypeVar

from ..classify import classify
from ..config import CompanyConfig
from ..errors import ParseError
from ..models import Job, make_job_id
from ..text import truncate

log = logging.getLogger(__name__)
T = TypeVar("T")

# Limits of the worker's contract (worker/runSchema.ts). A value over them would make the worker reject
# the whole run, so short text is cut here and a posting with an over-long id or URL is skipped.
MAX_SHORT_TEXT = 500
MAX_URL = 2048


def text_or_none(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = " ".join(value.split())
        return stripped or None
    return None


def short_text(value: str | None) -> str | None:
    """Cut a title/location/compensation/department value to the worker's limit."""
    return None if value is None else truncate(value, MAX_SHORT_TEXT)


def require_list(value: Any, what: str) -> list[Any]:
    if not isinstance(value, list):
        raise ParseError(f"unexpected {what} payload: expected a list, got {type(value).__name__}")
    return value


def require_dict(value: Any, what: str) -> dict[str, Any]:
    if not isinstance(value, dict):
        raise ParseError(f"unexpected {what} payload: expected an object, got {type(value).__name__}")
    return value


def build_job(
    company: CompanyConfig,
    *,
    posting_id: Any,
    title: Any,
    url: Any,
    source: str,
    description_text: str,
    location: str | None,
    posted_at: str | None,
    compensation: str | None,
    department: str | None,
    employment_type: str | None,
    include_all: bool,
) -> Job | None:
    """Classify and build a Job; returns None when the posting should be dropped."""
    clean_title = text_or_none(title)
    if clean_title is None:
        raise ParseError("posting has no title")
    job_type = classify(clean_title, description_text, employment_type)
    if job_type is None and not include_all:
        return None
    job_id = make_job_id(company.ats, company.slug, posting_id)
    if len(job_id) > MAX_SHORT_TEXT:
        raise ParseError(f"posting id is longer than {MAX_SHORT_TEXT} characters")
    clean_url = url if isinstance(url, str) else ""
    if len(clean_url) > MAX_URL:
        raise ParseError(f"posting url is longer than {MAX_URL} characters")
    return Job(
        id=job_id,
        company=company.name,
        ats=company.ats,
        title=truncate(clean_title, MAX_SHORT_TEXT),
        location=short_text(location),
        type=job_type,
        posted_at=posted_at,
        url=clean_url,
        source=source,
        description_text=description_text,
        compensation=short_text(compensation),
        department=short_text(department),
    )


def parse_each(items: Iterable[T], company: CompanyConfig, parse_one: Callable[[T], Job | None]) -> list[Job]:
    """Parse postings one by one; a malformed posting is logged and skipped, not fatal.

    If a posting failed and none parsed (every posting malformed, or the rest dropped by the classifier), raise
    instead: reporting the company as ok with no jobs would make the worker close all of its open jobs.
    """
    jobs: list[Job] = []
    total = 0
    skipped = 0
    for item in items:
        total += 1
        try:
            job = parse_one(item)
        except (ParseError, ValueError, TypeError, AttributeError, KeyError) as exc:
            skipped += 1
            log.warning("%s: skipping malformed posting: %s", company.name, exc)
            continue
        if job is not None:
            jobs.append(job)
    if skipped == total and total > 0:
        raise ParseError(f"{company.name}: all {total} postings failed to parse")
    if skipped > 0 and not jobs:
        raise ParseError(f"{company.name}: {skipped} of {total} postings failed to parse and none parsed")
    return jobs
