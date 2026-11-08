"""ATS adapters. Each exposes ``build_url(company)`` and ``fetch(company, client, include_all)``."""

from __future__ import annotations

from types import MappingProxyType
from typing import Callable, Mapping

from ..config import CompanyConfig
from ..models import Job
from . import ashby, greenhouse, lever, workday

Fetcher = Callable[..., list[Job]]

FETCHERS: Mapping[str, Fetcher] = MappingProxyType({
    "greenhouse": greenhouse.fetch,
    "lever": lever.fetch,
    "ashby": ashby.fetch,
    "workday": workday.fetch,
})

_URL_BUILDERS: Mapping[str, Callable[[CompanyConfig], str]] = MappingProxyType({
    "greenhouse": greenhouse.build_url,
    "lever": lever.build_url,
    "ashby": ashby.build_url,
    "workday": workday.build_url,
})


def build_listing_url(company: CompanyConfig) -> str:
    return _URL_BUILDERS[company.ats](company)


__all__ = ["FETCHERS", "Fetcher", "build_listing_url", "ashby", "greenhouse", "lever", "workday"]
