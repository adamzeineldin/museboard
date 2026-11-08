"""Run every configured company concurrently; one company's failure never aborts the run."""

from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from typing import Any, Mapping, Sequence

from .ats import FETCHERS, Fetcher
from .config import CompanyConfig
from .dates import format_utc, utc_now_iso
from .models import CompanyResult, Job

MAX_ERROR_CHARS = 500
DEFAULT_MAX_WORKERS = 4

log = logging.getLogger(__name__)


def _error_message(exc: BaseException) -> str:
    message = f"{type(exc).__name__}: {exc}"
    return message if len(message) <= MAX_ERROR_CHARS else message[: MAX_ERROR_CHARS - 1] + "…"


def _dedupe(jobs: Sequence[Job]) -> tuple[Job, ...]:
    seen: set[str] = set()
    unique: list[Job] = []
    for job in jobs:
        if job.id not in seen:
            seen.add(job.id)
            unique.append(job)
    return tuple(unique)


def scrape_company(
    company: CompanyConfig,
    client: Any,
    fetchers: Mapping[str, Fetcher],
    include_all: bool = False,
) -> CompanyResult:
    fetcher = fetchers.get(company.ats)
    if fetcher is None:
        return CompanyResult.failure(company.name, company.ats, f"no fetcher for ats {company.ats!r}")
    try:
        jobs = fetcher(company, client, include_all=include_all)
    except Exception as exc:  # isolate every failure to its company
        log.error("%s (%s) failed: %s", company.name, company.ats, _error_message(exc))
        return CompanyResult.failure(company.name, company.ats, _error_message(exc))
    unique = _dedupe(jobs)
    log.info("%s (%s): %d jobs", company.name, company.ats, len(unique))
    return CompanyResult(company=company.name, ats=company.ats, ok=True, error=None, jobs=unique)


def run_scrape(
    companies: Sequence[CompanyConfig],
    client: Any,
    *,
    fetchers: Mapping[str, Fetcher] | None = None,
    include_all: bool = False,
    max_workers: int = DEFAULT_MAX_WORKERS,
    now: datetime | None = None,
) -> dict[str, Any]:
    """Return ``{"run_at": ISO, "companies": [CompanyResult.to_dict(), ...]}`` in config order."""
    run_at = format_utc(now) if now is not None else utc_now_iso()
    registry = FETCHERS if fetchers is None else fetchers
    workers = max(1, min(max_workers, len(companies) or 1))
    with ThreadPoolExecutor(max_workers=workers, thread_name_prefix="scrape") as pool:
        results = list(pool.map(lambda c: scrape_company(c, client, registry, include_all), companies))
    return {"run_at": run_at, "companies": [result.to_dict() for result in results]}
