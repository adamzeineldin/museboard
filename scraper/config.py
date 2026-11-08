"""Load and validate ``companies.json``.

Shape::

    {"companies": [
      {"name": "Stripe", "ats": "greenhouse", "board": "stripe"},
      {"name": "Palantir", "ats": "lever", "site": "palantir", "region": "eu"?},
      {"name": "Ramp", "ats": "ashby", "board": "ramp"},
      {"name": "Capital One", "ats": "workday", "tenant": "capitalone", "wd": "wd12",
       "site": "Capital_One", "max_pages": 200?, "max_details": 500?}
    ]}

Optional on every entry: ``slug`` (defaults to the slugified name; used in job ids).
Companies without a public ATS feed must not appear here.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from types import MappingProxyType
from typing import Any, Mapping

from .errors import ConfigError
from .models import ATS_NAMES

_TOKEN_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$")
_TENANT_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,62}$")
_WD_RE = re.compile(r"^wd\d{1,3}$")
_SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

_REQUIRED: Mapping[str, tuple[str, ...]] = MappingProxyType({
    "greenhouse": ("board",),
    "lever": ("site",),
    "ashby": ("board",),
    "workday": ("tenant", "wd", "site"),
})
_OPTIONAL_INTS: Mapping[str, tuple[str, ...]] = MappingProxyType({
    "workday": ("max_pages", "max_details"),
})
_COMMON_KEYS = frozenset({"name", "ats", "slug"})
_LEVER_REGIONS = ("global", "eu")


@dataclass(frozen=True)
class CompanyConfig:
    name: str
    ats: str
    slug: str
    options: Mapping[str, Any]


def slugify(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.strip().lower()).strip("-")


def _validate_token(company: str, key: str, value: Any) -> str:
    pattern = {"tenant": _TENANT_RE, "wd": _WD_RE}.get(key, _TOKEN_RE)
    if not isinstance(value, str) or not pattern.fullmatch(value) or ".." in value:
        raise ConfigError(f"config: {company}: invalid {key} {value!r}")
    return value


def _validate_options(name: str, ats: str, entry: Mapping[str, Any]) -> dict[str, Any]:
    options: dict[str, Any] = {key: _validate_token(name, key, entry.get(key)) for key in _REQUIRED[ats]}
    int_keys = _OPTIONAL_INTS.get(ats, ())
    allowed = _COMMON_KEYS | set(_REQUIRED[ats]) | set(int_keys) | ({"region"} if ats == "lever" else set())
    unknown = set(entry) - allowed
    if unknown:
        raise ConfigError(f"config: {name}: unknown keys {sorted(unknown)} for {ats}")
    for key in int_keys:
        if key in entry:
            value = entry[key]
            if isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 10_000:
                raise ConfigError(f"config: {name}: {key} must be an integer 1..10000")
            options[key] = value
    if ats == "lever":
        region = entry.get("region", "global")
        if region not in _LEVER_REGIONS:
            raise ConfigError(f"config: {name}: region must be one of {_LEVER_REGIONS}")
        options["region"] = region
    return options


def _parse_entry(entry: Any) -> CompanyConfig:
    if not isinstance(entry, dict):
        raise ConfigError("config: each company must be an object")
    name = entry.get("name")
    if not isinstance(name, str) or not name.strip():
        raise ConfigError("config: company name is required")
    name = name.strip()
    ats = entry.get("ats")
    if ats not in ATS_NAMES:
        raise ConfigError(f"config: {name}: ats must be one of {ATS_NAMES} (companies without a feed are not scraped)")
    slug = entry.get("slug", slugify(name))
    if not isinstance(slug, str) or not _SLUG_RE.fullmatch(slug):
        raise ConfigError(f"config: {name}: invalid slug {slug!r}")
    options = _validate_options(name, ats, entry)
    return CompanyConfig(name=name, ats=ats, slug=slug, options=MappingProxyType(options))


def parse_companies(data: Any) -> tuple[CompanyConfig, ...]:
    if not isinstance(data, dict) or not isinstance(data.get("companies"), list):
        raise ConfigError('config: expected {"companies": [...]}')
    companies = tuple(_parse_entry(entry) for entry in data["companies"])
    seen: set[str] = set()
    for company in companies:
        for key in (company.name.lower(), company.slug):
            if key in seen:
                raise ConfigError(f"config: duplicate company {company.name!r}")
        seen.update({company.name.lower(), company.slug})
    return companies


def load_companies(path: str | Path) -> tuple[CompanyConfig, ...]:
    try:
        with open(path, encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise ConfigError(f"config: file not found: {path}") from exc
    except (OSError, json.JSONDecodeError) as exc:
        raise ConfigError(f"config: cannot read {path}: {exc}") from exc
    return parse_companies(data)
