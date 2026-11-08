"""Lever Postings API: GET api.lever.co/v0/postings/{site}?mode=json (EU: api.eu.lever.co)

Response: a JSON list of ``{id, text, hostedUrl, createdAt (epoch ms), categories: {location,
team, department, commitment}, descriptionPlain, description (HTML), lists: [{text, content}],
additionalPlain, salaryRange?: {currency, interval, min, max}, salaryDescriptionPlain?}``.
"""

from __future__ import annotations

from typing import Any
from urllib.parse import quote

from ..config import CompanyConfig
from ..dates import iso_from_epoch_ms
from ..models import Job
from ..text import clean_plain_text, strip_html
from .common import build_job, parse_each, require_dict, require_list, text_or_none

ATS = "lever"
SOURCE = "Lever feed"
HOSTS = {"global": "api.lever.co", "eu": "api.eu.lever.co"}
_INTERVALS = {
    "per-year-salary": "per year",
    "per-month-salary": "per month",
    "per-week-salary": "per week",
    "per-day-wage": "per day",
    "per-hour-wage": "per hour",
    "one-time": "one time",
}


def build_url(company: CompanyConfig) -> str:
    host = HOSTS[company.options.get("region", "global")]
    return f"https://{host}/v0/postings/{quote(company.options['site'], safe='')}?mode=json"


def _number(value: Any) -> str | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    return f"{value:,.0f}"


def format_salary(salary: Any) -> str | None:
    if not isinstance(salary, dict):
        return None
    low, high = _number(salary.get("min")), _number(salary.get("max"))
    if low is None and high is None:
        return None
    amount = f"{low}–{high}" if low and high and low != high else (low or high)
    parts = [text_or_none(salary.get("currency")), amount, _INTERVALS.get(salary.get("interval"))]
    return " ".join(part for part in parts if part)


def _plain_or_html(posting: dict[str, Any], plain_key: str, html_key: str) -> str:
    plain = posting.get(plain_key)
    return plain if isinstance(plain, str) and plain.strip() else strip_html(posting.get(html_key))


def _description(posting: dict[str, Any]) -> str:
    parts = [_plain_or_html(posting, "descriptionPlain", "description")]
    for item in posting.get("lists") or []:
        if isinstance(item, dict):
            parts.append(f"{text_or_none(item.get('text')) or ''}\n{strip_html(item.get('content'))}")
    parts.append(_plain_or_html(posting, "additionalPlain", "additional"))
    return clean_plain_text("\n".join(parts))


def _parse_posting(raw: Any, company: CompanyConfig, include_all: bool) -> Job | None:
    posting = require_dict(raw, "lever posting")
    categories = posting.get("categories") if isinstance(posting.get("categories"), dict) else {}
    compensation = format_salary(posting.get("salaryRange")) or text_or_none(posting.get("salaryDescriptionPlain"))
    return build_job(
        company,
        posting_id=posting.get("id"),
        title=posting.get("text"),
        url=posting.get("hostedUrl"),
        source=SOURCE,
        description_text=_description(posting),
        location=text_or_none(categories.get("location")),
        posted_at=iso_from_epoch_ms(posting.get("createdAt")),
        compensation=compensation,
        department=text_or_none(categories.get("team")) or text_or_none(categories.get("department")),
        employment_type=text_or_none(categories.get("commitment")),
        include_all=include_all,
    )


def parse(payload: Any, company: CompanyConfig, include_all: bool = False) -> list[Job]:
    postings = require_list(payload, "lever postings")
    return parse_each(postings, company, lambda raw: _parse_posting(raw, company, include_all))


def fetch(company: CompanyConfig, client: Any, include_all: bool = False) -> list[Job]:
    return parse(client.get_json(build_url(company)), company, include_all)
