"""Helpers shared by the ATS adapters."""

from __future__ import annotations

import logging
from typing import Any, Callable, Iterable, TypeVar

from ..classify import classify
from ..config import CompanyConfig
from ..errors import ParseError
from ..models import Job, make_job_id

log = logging.getLogger(__name__)
T = TypeVar("T")


def text_or_none(value: Any) -> str | None:
    if isinstance(value, str):
        stripped = " ".join(value.split())
        return stripped or None
    return None


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
    return Job(
        id=make_job_id(company.ats, company.slug, posting_id),
        company=company.name,
        ats=company.ats,
        title=clean_title,
        location=location,
        type=job_type,
        posted_at=posted_at,
        url=url if isinstance(url, str) else "",
        source=source,
        description_text=description_text,
        compensation=compensation,
        department=department,
    )


def parse_each(items: Iterable[T], company: CompanyConfig, parse_one: Callable[[T], Job | None]) -> list[Job]:
    """Parse postings one by one; a malformed posting is logged and skipped, not fatal."""
    jobs: list[Job] = []
    for item in items:
        try:
            job = parse_one(item)
        except (ParseError, ValueError, TypeError, AttributeError, KeyError) as exc:
            log.warning("%s: skipping malformed posting: %s", company.name, exc)
            continue
        if job is not None:
            jobs.append(job)
    return jobs
