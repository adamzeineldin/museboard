"""Greenhouse Job Board API: GET boards-api.greenhouse.io/v1/boards/{board}/jobs?content=true

Response: ``{"jobs": [{id, title, absolute_url, location: {name}, first_published, updated_at,
content (entity-escaped HTML), departments: [{name}], ...}], "meta": {"total": n}}``.
The board API exposes no structured pay field, so compensation is always None.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from ..config import CompanyConfig
from ..dates import iso_from_string
from ..models import Job
from ..text import strip_escaped_html
from .common import build_job, parse_each, require_dict, require_list, text_or_none

ATS = "greenhouse"
SOURCE = "Greenhouse feed"
BASE_URL = "https://boards-api.greenhouse.io/v1/boards"


def build_url(company: CompanyConfig) -> str:
    return f"{BASE_URL}/{quote(company.options['board'], safe='')}/jobs?content=true"


def _first_name(items: Any) -> str | None:
    if isinstance(items, list):
        for item in items:
            if isinstance(item, dict) and text_or_none(item.get("name")):
                return text_or_none(item.get("name"))
    return None


def _parse_posting(raw: Any, company: CompanyConfig, include_all: bool) -> Job | None:
    posting = require_dict(raw, "greenhouse posting")
    location = posting.get("location")
    return build_job(
        company,
        posting_id=posting.get("id"),
        title=posting.get("title"),
        url=posting.get("absolute_url"),
        source=SOURCE,
        description_text=strip_escaped_html(posting.get("content")),
        location=text_or_none(location.get("name")) if isinstance(location, dict) else None,
        posted_at=iso_from_string(posting.get("first_published")) or iso_from_string(posting.get("updated_at")),
        compensation=None,
        department=_first_name(posting.get("departments")),
        employment_type=None,
        include_all=include_all,
    )


def parse(payload: Any, company: CompanyConfig, include_all: bool = False) -> list[Job]:
    postings = require_list(require_dict(payload, "greenhouse").get("jobs"), "greenhouse jobs")
    return parse_each(postings, company, lambda raw: _parse_posting(raw, company, include_all))


def fetch(company: CompanyConfig, client: Any, include_all: bool = False) -> list[Job]:
    return parse(client.get_json(build_url(company)), company, include_all)
