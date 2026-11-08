"""Ashby public Job Posting API:
GET api.ashbyhq.com/posting-api/job-board/{board}?includeCompensation=true

Response: ``{"apiVersion": "1", "jobs": [{id, title, department, team, employmentType
("FullTime"|"PartTime"|"Intern"|"Contract"|"Temporary"), location, publishedAt, isListed,
jobUrl, applyUrl, descriptionHtml, descriptionPlain, shouldDisplayCompensationOnJobPostings,
compensation?: {compensationTierSummary, scrapeableCompensationSalarySummary, ...}}]}``.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from ..config import CompanyConfig
from ..dates import iso_from_string
from ..models import Job
from ..text import clean_plain_text, strip_html
from .common import build_job, parse_each, require_dict, require_list, text_or_none

ATS = "ashby"
SOURCE = "Ashby feed"
BASE_URL = "https://api.ashbyhq.com/posting-api/job-board"


def build_url(company: CompanyConfig) -> str:
    return f"{BASE_URL}/{quote(company.options['board'], safe='')}?includeCompensation=true"


def _compensation(posting: dict[str, Any]) -> str | None:
    if posting.get("shouldDisplayCompensationOnJobPostings") is False:
        return None
    comp = posting.get("compensation")
    if not isinstance(comp, dict):
        return None
    return text_or_none(comp.get("scrapeableCompensationSalarySummary")) or text_or_none(
        comp.get("compensationTierSummary")
    )


def _description(posting: dict[str, Any]) -> str:
    from_html = strip_html(posting.get("descriptionHtml"))
    return from_html or clean_plain_text(posting.get("descriptionPlain"))


def _parse_posting(raw: Any, company: CompanyConfig, include_all: bool) -> Job | None:
    posting = require_dict(raw, "ashby posting")
    if posting.get("isListed") is False:
        return None
    return build_job(
        company,
        posting_id=posting.get("id"),
        title=posting.get("title"),
        url=posting.get("jobUrl") or posting.get("applyUrl"),
        source=SOURCE,
        description_text=_description(posting),
        location=text_or_none(posting.get("location")),
        posted_at=iso_from_string(posting.get("publishedAt")),
        compensation=_compensation(posting),
        department=text_or_none(posting.get("department")) or text_or_none(posting.get("team")),
        employment_type=text_or_none(posting.get("employmentType")),
        include_all=include_all,
    )


def parse(payload: Any, company: CompanyConfig, include_all: bool = False) -> list[Job]:
    postings = require_list(require_dict(payload, "ashby").get("jobs"), "ashby jobs")
    return parse_each(postings, company, lambda raw: _parse_posting(raw, company, include_all))


def fetch(company: CompanyConfig, client: Any, include_all: bool = False) -> list[Job]:
    return parse(client.get_json(build_url(company)), company, include_all)
