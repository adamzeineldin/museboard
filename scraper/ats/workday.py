"""Workday candidate-experience (CXS) public API.

Listing: POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
  body ``{"appliedFacets": {}, "limit": 20, "offset": n, "searchText": ""}``
  -> ``{"total": n, "jobPostings": [{title, externalPath, locationsText, postedOn, bulletFields}]}``
  (``total`` is only reliable on the first page; later pages may report 0.)
Detail:  GET  https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}{externalPath}
  -> ``{"jobPostingInfo": {title, jobDescription (HTML), location, startDate (YYYY-MM-DD),
  timeType, jobReqId, externalUrl, ...}}``

Large tenants list thousands of postings, so details are fetched only for titles that
might be early-career (``might_be_early_career``). Totals are approximate, so a short non-empty page
ends the listing without error. A listing cut short by ``max_pages``, a page that comes back empty
before ``total`` is reached, a first page without a usable ``total``, or a
candidate set above ``max_details`` raises, so the company is reported ``ok: false`` and the
worker does not close its jobs on an incomplete picture. Each posting is built through ``parse_each``:
a malformed one is skipped, under the same failure rule as the other adapters.
"""

from __future__ import annotations

import logging
import re
from typing import Any
from urllib.parse import quote

from ..classify import might_be_early_career
from ..config import CompanyConfig
from ..dates import iso_from_date
from ..errors import ParseError, ScrapeError
from ..models import Job
from ..text import strip_html
from .common import build_job, parse_each, require_dict, require_list, text_or_none

ATS = "workday"
SOURCE = "Workday feed"
PAGE_SIZE = 20
DEFAULT_MAX_PAGES = 200
DEFAULT_MAX_DETAILS = 500
_PATH_RE = re.compile(r"^/job/[A-Za-z0-9._~%()\-/]+$")

log = logging.getLogger(__name__)


def _origin(company: CompanyConfig) -> str:
    return f"https://{company.options['tenant']}.{company.options['wd']}.myworkdayjobs.com"


def _cxs_base(company: CompanyConfig) -> str:
    tenant, site = company.options["tenant"], quote(company.options["site"], safe="")
    return f"{_origin(company)}/wday/cxs/{tenant}/{site}"


def build_url(company: CompanyConfig) -> str:
    return f"{_cxs_base(company)}/jobs"


def _validated_path(external_path: Any) -> str:
    if not isinstance(external_path, str) or not _PATH_RE.fullmatch(external_path):
        raise ParseError(f"unexpected workday externalPath {external_path!r}")
    if ".." in external_path or "//" in external_path:
        raise ParseError(f"unexpected workday externalPath {external_path!r}")
    return external_path


def detail_url(company: CompanyConfig, external_path: Any) -> str:
    return f"{_cxs_base(company)}{_validated_path(external_path)}"


def public_url(company: CompanyConfig, external_path: str) -> str:
    return f"{_origin(company)}/{quote(company.options['site'], safe='')}{external_path}"


def posting_id_from_path(external_path: str) -> str:
    """``/job/Toronto-ON/Intern--Strategy-Analyst_R243855-1`` -> ``R243855-1`` (title-independent)."""
    last = external_path.rstrip("/").rsplit("/", 1)[-1]
    return last.rsplit("_", 1)[-1] if "_" in last else last


def _first_page_total(payload: dict[str, Any], items: list[Any]) -> int:
    """The posting count from the first page; without it the listing cannot be known to be complete.

    Read even when the page is empty: a positive total with no items is a short listing, not an empty board.
    """
    raw_total = payload.get("total")
    if isinstance(raw_total, int) and not isinstance(raw_total, bool) and raw_total > 0:
        return raw_total
    if not items:
        return 0
    raise ParseError(f"workday listing has no usable total ({raw_total!r})")


def _list_postings(company: CompanyConfig, client: Any) -> list[dict[str, Any]]:
    max_pages = company.options.get("max_pages", DEFAULT_MAX_PAGES)
    postings: list[dict[str, Any]] = []
    total: int | None = None
    for page in range(max_pages):
        body = {"appliedFacets": {}, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE, "searchText": ""}
        payload = require_dict(client.post_json(build_url(company), body), "workday listing")
        items = require_list(payload.get("jobPostings"), "workday jobPostings")
        if total is None:
            total = _first_page_total(payload, items)
        postings = postings + [item for item in items if isinstance(item, dict)]
        if items == [] and len(postings) < total:
            # A short listing must not look complete, or the worker would close the jobs it is missing.
            raise ScrapeError(f"workday listing ended at {len(postings)} of {total} postings")
        # Workday totals are approximate, so a short non-empty page is the real end of the listing.
        if len(items) < PAGE_SIZE or (page + 1) * PAGE_SIZE >= total:
            return postings
    raise ScrapeError(f"workday listing truncated at {max_pages} pages ({total} postings reported)")


def _job_from_detail(company: CompanyConfig, listing: dict[str, Any], detail: Any, include_all: bool) -> Job | None:
    info = require_dict(require_dict(detail, "workday detail").get("jobPostingInfo"), "workday jobPostingInfo")
    path = listing["externalPath"]
    external = info.get("externalUrl")
    on_tenant = isinstance(external, str) and external.startswith(_origin(company) + "/")
    return build_job(
        company,
        posting_id=posting_id_from_path(path),
        title=info.get("title") or listing.get("title"),
        url=external if on_tenant else public_url(company, path),
        source=SOURCE,
        description_text=strip_html(info.get("jobDescription")),
        location=text_or_none(info.get("location")) or text_or_none(listing.get("locationsText")),
        posted_at=iso_from_date(info.get("startDate")),
        compensation=None,
        department=None,
        employment_type=None,
        include_all=include_all,
    )


def _job_from_listing(company: CompanyConfig, listing: dict[str, Any]) -> Job | None:
    return build_job(
        company,
        posting_id=posting_id_from_path(listing["externalPath"]),
        title=listing.get("title"),
        url=public_url(company, listing["externalPath"]),
        source=SOURCE,
        description_text="",
        location=text_or_none(listing.get("locationsText")),
        posted_at=None,
        compensation=None,
        department=None,
        employment_type=None,
        include_all=True,
    )


def _is_candidate(listing: dict[str, Any]) -> bool:
    return might_be_early_career(listing.get("title"))


def _parse_posting(company: CompanyConfig, client: Any, item: dict[str, Any], include_all: bool) -> Job | None:
    """One posting; raises ParseError (skipped by parse_each) when it is malformed. HTTP errors stay fatal."""
    candidate = _is_candidate(item)
    if not candidate and not include_all:
        return None
    listing = {**item, "externalPath": _validated_path(item.get("externalPath"))}
    if not candidate:
        return _job_from_listing(company, listing)
    detail = client.get_json(detail_url(company, listing["externalPath"]))
    return _job_from_detail(company, listing, detail, include_all)


def fetch(company: CompanyConfig, client: Any, include_all: bool = False) -> list[Job]:
    listings = _list_postings(company, client)
    candidates = [item for item in listings if _is_candidate(item)]
    max_details = company.options.get("max_details", DEFAULT_MAX_DETAILS)
    if len(candidates) > max_details:
        raise ScrapeError(f"workday: {len(candidates)} candidate postings exceed max_details={max_details}")
    log.info("%s: %d postings listed, fetching %d candidate details", company.name, len(listings), len(candidates))
    return parse_each(listings, company, lambda item: _parse_posting(company, client, item, include_all))
