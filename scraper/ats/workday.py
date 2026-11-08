"""Workday candidate-experience (CXS) public API.

Listing: POST https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}/jobs
  body ``{"appliedFacets": {}, "limit": 20, "offset": n, "searchText": ""}``
  -> ``{"total": n, "jobPostings": [{title, externalPath, locationsText, postedOn, bulletFields}]}``
  (``total`` is only reliable on the first page; later pages may report 0.)
Detail:  GET  https://{tenant}.{wd}.myworkdayjobs.com/wday/cxs/{tenant}/{site}{externalPath}
  -> ``{"jobPostingInfo": {title, jobDescription (HTML), location, startDate (YYYY-MM-DD),
  timeType, jobReqId, externalUrl, ...}}``

Large tenants list thousands of postings, so details are fetched only for titles that
might be early-career (``might_be_early_career``). A listing cut short by ``max_pages`` or a
candidate set above ``max_details`` raises, so the company is reported ``ok: false`` and the
worker does not close its jobs on an incomplete picture.
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
from .common import build_job, require_dict, require_list, text_or_none

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


def _list_postings(company: CompanyConfig, client: Any) -> list[dict[str, Any]]:
    max_pages = company.options.get("max_pages", DEFAULT_MAX_PAGES)
    postings: list[dict[str, Any]] = []
    total: int | None = None
    for page in range(max_pages):
        body = {"appliedFacets": {}, "limit": PAGE_SIZE, "offset": page * PAGE_SIZE, "searchText": ""}
        payload = require_dict(client.post_json(build_url(company), body), "workday listing")
        items = require_list(payload.get("jobPostings"), "workday jobPostings")
        if total is None:
            raw_total = payload.get("total")
            total = raw_total if isinstance(raw_total, int) and not isinstance(raw_total, bool) else 0
        postings = postings + [item for item in items if isinstance(item, dict)]
        if not items or (page + 1) * PAGE_SIZE >= total:
            if items == [] and len(postings) < total:
                log.warning("%s: workday listing ended at %d of %d postings", company.name, len(postings), total)
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


def fetch(company: CompanyConfig, client: Any, include_all: bool = False) -> list[Job]:
    listings = []
    for item in _list_postings(company, client):
        try:
            listings.append({**item, "externalPath": _validated_path(item.get("externalPath"))})
        except ParseError as exc:
            log.warning("%s: skipping posting: %s", company.name, exc)
    candidates = [item for item in listings if might_be_early_career(item.get("title"))]
    max_details = company.options.get("max_details", DEFAULT_MAX_DETAILS)
    if len(candidates) > max_details:
        raise ScrapeError(f"workday: {len(candidates)} candidate postings exceed max_details={max_details}")
    candidate_paths = {item["externalPath"] for item in candidates}
    log.info("%s: %d postings listed, fetching %d candidate details", company.name, len(listings), len(candidates))
    jobs: list[Job] = []
    for item in listings:
        path = item["externalPath"]
        if path in candidate_paths:
            url = detail_url(company, path)
            job = _job_from_detail(company, item, client.get_json(url), include_all)
        elif include_all:
            job = _job_from_listing(company, item)
        else:
            job = None
        if job is not None:
            jobs.append(job)
    return jobs
